#!/usr/bin/env python3
"""
robot_led_status_node - ROS2 Jazzy
Monitors Nav2 + Kobuki state and sends LED commands to ESP32.

States (priority high → low):
    error    - nav ABORTED, bumper/cliff hit  (5 s → idle/standby)
    success  - nav goal reached               (5 s → idle/standby)
    navigate - goal accepted / executing
    charging - battery actively charging while idle/standby
    idle     - session active, robot ready
    standby  - no active user session (LEDs off)

Subscribes:
    /navigate_to_pose/_action/status          (GoalStatusArray)
    /navigate_through_poses/_action/status     (GoalStatusArray)
    /events/bumper                             (BumperEvent)
    /events/cliff                              (CliffEvent)
    /events/wheel_drop                         (WheelDropEvent)
    /sensors/battery_state                     (BatteryState)
    /session_active                            (Bool) - True = user session active
    /led_command                               (String) - manual override
Publishes:
    /led_state                                 (String) - current state

Notes:
    - STATUS_CANCELED is NOT an error - it fires when the user retargets
      while navigating. Only STATUS_ABORTED (planner failure) triggers error.
    - Bumper and cliff always trigger error regardless of navigation state.
    - Wheel-drop only triggers during navigation (picking the robot up is normal).
    - POWER_SUPPLY_STATUS_FULL = battery ready; no charging animation needed.
    - Publish True to /session_active when a user scans the QR / starts a chat,
      False when the session ends. LEDs stay off (standby) until a session begins.

Usage:
    ros2 run artec_leds robot_led_status_node
    ros2 run artec_leds robot_led_status_node --ros-args -p serial_port:=/dev/ttyUSB3
"""

import threading

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, DurabilityPolicy, HistoryPolicy
from action_msgs.msg import GoalStatusArray, GoalStatus
from sensor_msgs.msg import BatteryState
from std_msgs.msg import Bool, String
from kobuki_ros_interfaces.msg import BumperEvent, CliffEvent, WheelDropEvent

import serial


RESULT_DISPLAY_SECS = 5.0
HEARTBEAT_SECS      = 4.0    # resync ESP32 quickly after a reboot
SERIAL_RETRY_SECS   = 3.0

_BUMPER_NAMES    = ['LEFT', 'CENTER', 'RIGHT']
_CLIFF_NAMES     = ['LEFT', 'CENTER', 'RIGHT']
_WHEEL_NAMES     = ['LEFT', 'RIGHT']


class RobotLedStatusNode(Node):
    def __init__(self):
        super().__init__('robot_led_status')

        self.declare_parameter('serial_port',        '/dev/esp32')
        self.declare_parameter('baud_rate',          115200)
        self.declare_parameter('result_display_secs', RESULT_DISPLAY_SECS)
        self.declare_parameter('heartbeat_secs',      HEARTBEAT_SECS)

        self._port          = self.get_parameter('serial_port').value
        self._baud          = self.get_parameter('baud_rate').value
        self._result_secs   = self.get_parameter('result_display_secs').value
        self._heartbeat_secs = self.get_parameter('heartbeat_secs').value

        self._ser      = None
        self._ser_lock = threading.Lock()
        self._connect_serial()
        if self._ser is None:
            self.get_logger().warn(
                f'{self._port} not available - will retry every {SERIAL_RETRY_SECS}s')
            self._retry_timer = self.create_timer(SERIAL_RETRY_SECS, self._retry_connect)
        else:
            self._retry_timer = None

        self._current_cmd   = ''
        self._is_navigating = False
        self._is_charging   = False
        self._in_session    = False   # True when a user has an active session
        self._result_timer  = None

        action_qos = QoSProfile(
            reliability=ReliabilityPolicy.RELIABLE,
            durability=DurabilityPolicy.TRANSIENT_LOCAL,
            history=HistoryPolicy.KEEP_LAST,
            depth=1,
        )
        sensor_qos = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=1,
        )

        for topic in ('/navigate_to_pose/_action/status',
                      '/navigate_through_poses/_action/status'):
            self.create_subscription(
                GoalStatusArray, topic, self._nav_status_cb, action_qos)

        self.create_subscription(BumperEvent,   '/events/bumper',          self._bumper_cb,  sensor_qos)
        self.create_subscription(CliffEvent,    '/events/cliff',           self._cliff_cb,   sensor_qos)
        self.create_subscription(WheelDropEvent,'/events/wheel_drop',      self._wheel_cb,   sensor_qos)
        self.create_subscription(BatteryState,  '/sensors/battery_state',  self._battery_cb, sensor_qos)
        self.create_subscription(Bool,          '/session_active',         self._session_cb, 10)
        self.create_subscription(String,        '/led_command',            self._manual_cb,  10)

        self._pub_state = self.create_publisher(String, '/led_state', 10)

        self.create_timer(self._heartbeat_secs, self._heartbeat)

        self._reader = threading.Thread(target=self._read_serial, daemon=True)
        self._reader.start()

        self._send_command('standby', force=True)
        self.get_logger().info('Robot LED status node started (standby until session).')

    # ═══════════════════════════════════════════════════════
    #  SERIAL
    # ═══════════════════════════════════════════════════════

    def _connect_serial(self):
        with self._ser_lock:
            if self._ser is not None:
                return True
            try:
                # Disable DTR/RTS to prevent ESP32 auto-reset on connect
                ser = serial.Serial()
                ser.port = self._port
                ser.baudrate = self._baud
                ser.timeout = 0.1
                ser.dtr = False
                ser.rts = False
                ser.open()
                self._ser = ser
                self.get_logger().info(f'Serial opened: {self._port} @ {self._baud}')
                return True
            except serial.SerialException:
                self._ser = None
                return False

    def _retry_connect(self):
        if self._connect_serial():
            self._retry_timer.cancel()
            self._retry_timer = None
            self._send_command(self._current_cmd or 'standby', force=True)

    # ═══════════════════════════════════════════════════════
    #  CALLBACKS
    # ═══════════════════════════════════════════════════════

    def _nav_status_cb(self, msg: GoalStatusArray):
        if not msg.status_list:
            if self._is_navigating:
                self._is_navigating = False
                self._resolve_idle_state()
            return

        status = msg.status_list[-1].status

        if status in (GoalStatus.STATUS_ACCEPTED, GoalStatus.STATUS_EXECUTING):
            self._cancel_result_timer()
            self._is_navigating = True
            self._send_command('navigate')

        elif status == GoalStatus.STATUS_SUCCEEDED:
            self._is_navigating = False
            self._show_result('success')

        elif status == GoalStatus.STATUS_ABORTED:
            # Planner genuinely failed - show error
            self._is_navigating = False
            self._show_result('error')

        elif status == GoalStatus.STATUS_CANCELED:
            # User sent a new goal while navigating - not an error, quietly return
            self._is_navigating = False
            self._resolve_idle_state()

    def _bumper_cb(self, msg: BumperEvent):
        # Bumper is always a real collision - signal error regardless of nav state
        if msg.state == BumperEvent.PRESSED:
            self.get_logger().warn(f'Bumper {_BUMPER_NAMES[msg.bumper]} hit')
            self._is_navigating = False
            self._show_result('error')

    def _cliff_cb(self, msg: CliffEvent):
        # Cliff is always a hazard - signal error regardless of nav state
        if msg.state == CliffEvent.CLIFF:
            self.get_logger().warn(f'Cliff {_CLIFF_NAMES[msg.sensor]} detected')
            self._is_navigating = False
            self._show_result('error')

    def _wheel_cb(self, msg: WheelDropEvent):
        # Wheel-drop only relevant during navigation - picking the robot up is normal maintenance
        if msg.state == WheelDropEvent.DROPPED and self._is_navigating:
            self.get_logger().warn(f'Wheel {_WHEEL_NAMES[msg.wheel]} dropped during navigation')
            self._is_navigating = False
            self._show_result('error')

    def _battery_cb(self, msg: BatteryState):
        was_charging = self._is_charging
        # FULL = battery ready; no need for a charging animation
        self._is_charging = (
            msg.power_supply_status == BatteryState.POWER_SUPPLY_STATUS_CHARGING
        )
        if self._is_charging != was_charging:
            self._resolve_idle_state()

    def _session_cb(self, msg: Bool):
        was_active       = self._in_session
        self._in_session = msg.data
        if self._in_session and not was_active:
            self.get_logger().info('Session started - waking from standby')
            self._resolve_idle_state()
        elif not self._in_session and was_active:
            self.get_logger().info('Session ended - entering standby')
            self._resolve_idle_state()

    def _manual_cb(self, msg: String):
        cmd = msg.data.strip().lower()
        valid = ('idle', 'navigate', 'success', 'error', 'charging', 'standby')
        if cmd not in valid:
            return
        self.get_logger().info(f'Manual override: {cmd}')
        self._cancel_result_timer()
        self._is_navigating = (cmd == 'navigate')
        self._in_session    = (cmd != 'standby')
        self._send_command(cmd, force=True)

    # ═══════════════════════════════════════════════════════
    #  STATE MACHINE
    # ═══════════════════════════════════════════════════════

    def _resolve_idle_state(self):
        """Choose the right resting state. Never overrides an active result timer or navigation."""
        if self._result_timer is not None or self._is_navigating:
            return
        if self._is_charging:
            # Charging is always visible - even without a session
            self._send_command('charging')
        elif self._in_session:
            self._send_command('idle')
        else:
            self._send_command('standby')

    def _show_result(self, result_cmd: str):
        self._cancel_result_timer()
        self._send_command(result_cmd, force=True)
        self._result_timer = self.create_timer(self._result_secs, self._result_timeout)

    def _result_timeout(self):
        self._cancel_result_timer()
        self._resolve_idle_state()

    def _cancel_result_timer(self):
        if self._result_timer is not None:
            self.destroy_timer(self._result_timer)
            self._result_timer = None

    def _heartbeat(self):
        if self._current_cmd:
            self._send_command(self._current_cmd, force=True)

    # ═══════════════════════════════════════════════════════
    #  SERIAL I/O
    # ═══════════════════════════════════════════════════════

    def _send_command(self, cmd: str, force: bool = False):
        if not force and cmd == self._current_cmd:
            return
        self._current_cmd = cmd
        self.get_logger().info(f'LED → {cmd}')

        with self._ser_lock:
            if self._ser is None:
                return
            try:
                self._ser.write(f'{cmd}\n'.encode())
            except serial.SerialException as e:
                self.get_logger().warn(f'Serial write failed: {e}', throttle_duration_sec=5.0)
                self._ser = None
                if self._retry_timer is None:
                    self._retry_timer = self.create_timer(SERIAL_RETRY_SECS, self._retry_connect)

        msg = String()
        msg.data = cmd
        self._pub_state.publish(msg)

    def _read_serial(self):
        while rclpy.ok():
            with self._ser_lock:
                ser = self._ser
            if ser is None:
                rclpy.ok() and self.get_clock().sleep_for(
                    rclpy.duration.Duration(seconds=1))
                continue
            try:
                line = ser.readline().decode('ascii', errors='ignore').strip()
                if line:
                    self.get_logger().debug(f'ESP32: {line}')
            except serial.SerialException:
                with self._ser_lock:
                    self._ser = None
            except Exception as e:
                self.get_logger().debug(f'Ignored background read exception: {e}')

    # ═══════════════════════════════════════════════════════
    #  CLEANUP
    # ═══════════════════════════════════════════════════════

    def destroy_node(self):
        self.get_logger().info('Shutting down - sending standby to ESP32')
        self._cancel_result_timer()
        with self._ser_lock:
            if self._ser is not None:
                try:
                    self._ser.write(b'standby\n')
                    self._ser.close()
                except Exception as e:
                    self.get_logger().debug(f'Ignored serial write standby exception: {e}')
                self._ser = None
        super().destroy_node()


def main(args=None):
    rclpy.init(args=args)
    try:
        node = RobotLedStatusNode()
        rclpy.spin(node)
    except KeyboardInterrupt:
        # Exit cleanly on user interruption
        pass
    finally:
        if rclpy.ok() and 'node' in locals():
            node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
