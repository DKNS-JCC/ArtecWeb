/*
 * artec_leds.ino  —  ESP32 + WS2812B 96 LEDs
 * ArtTEC Kobuki robot LED controller
 *
 * Serial protocol (115200 baud), same port for both modes:
 *
 *   BINARY  0xFF 0xFE + 276 bytes (92 LEDs × R,G,B)
 *           → lidar distance map, rendered directly
 *
 *   ASCII   "idle\n" | "navigate\n" | "success\n" |
 *           "error\n" | "charging\n" | "lidar\n" | "stop\n"
 *           → switches to the corresponding animation
 *
 * Telemetry out (every 1 s): "T:<lidar_fps>,<state>\n"
 * Status out:                "[ESP32] <message>\n"
 *
 * Palette:  ArtTEC brand  —  warm bone / ink / terracotta
 *   Primary  #B0461E   R=176 G=70  B=30   (terracotta)
 *   Accent   #D9743E   R=217 G=116 B=62   (amber)
 *   Error    #A3361F   R=163 G=54  B=31   (deep terracotta)
 *
 * Adjust LED_PIN and BRIGHTNESS for your hardware.
 */

#include <FastLED.h>
#include <math.h>

// ──────────────────────────────────────────────────────────────
//  Hardware
// ──────────────────────────────────────────────────────────────
#define LED_PIN      5        // GPIO → WS2812B data
#define NUM_LEDS     96
#define LED_TYPE     WS2812B
#define COLOR_ORDER  GRB
#define BRIGHTNESS   70       // 0–255 (scale to your power budget)
#define MAX_MA       2000     // mA cap at 5 V

// ──────────────────────────────────────────────────────────────
//  Protocol
// ──────────────────────────────────────────────────────────────
#define PROTO_H1      0xFF
#define PROTO_H2      0xFE
#define LIDAR_LEDS    92
#define LIDAR_PAYLOAD (LIDAR_LEDS * 3)    // 276 bytes

// ──────────────────────────────────────────────────────────────
//  ArtTEC palette  (style.css @theme block)
// ──────────────────────────────────────────────────────────────
static const CRGB C_TERRACOTTA = CRGB(176,  70,  30);  // #B0461E primary
static const CRGB C_AMBER      = CRGB(217, 116,  62);  // #D9743E accent
static const CRGB C_DEEP       = CRGB(163,  54,  31);  // #A3361F deep
static const CRGB C_SUCCESS    = CRGB( 55, 155,  40);  // warm olive green
static const CRGB C_ERROR      = CRGB(220,  30,  10);  // urgent red
static const CRGB C_CHARGE_LO  = CRGB(210, 145,  30);  // amber (low charge)
static const CRGB C_CHARGE_HI  = CRGB(176,  70,  30);  // terracotta (full)
static const CRGB C_BG_DIM     = CRGB( 18,   7,   3);  // near-black terracotta

// ──────────────────────────────────────────────────────────────
//  State machine
// ──────────────────────────────────────────────────────────────
enum State : uint8_t {
  S_IDLE = 0,
  S_NAVIGATE,
  S_SUCCESS,
  S_ERROR,
  S_CHARGING,
  S_LIDAR,
  S_STANDBY,
  S_STOP,
  S_COUNT
};

static const char* STATE_NAMES[S_COUNT] = {
  "idle", "navigate", "success", "error", "charging", "lidar", "standby", "stop"
};

static CRGB         leds[NUM_LEDS];
static State        currentState = S_IDLE;
static unsigned long stateMs     = 0;

// ──────────────────────────────────────────────────────────────
//  Serial parser
// ──────────────────────────────────────────────────────────────
static uint8_t rxBuf[LIDAR_PAYLOAD + 2];
static int     rxLen    = 0;
static bool    inBinary = false;

// ──────────────────────────────────────────────────────────────
//  Telemetry
// ──────────────────────────────────────────────────────────────
static unsigned long lastTelemMs = 0;
static uint32_t      lidarFrames = 0;   // frames received since last telem

// ══════════════════════════════════════════════════════════════
//  Setup
// ══════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);

  FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, NUM_LEDS)
         .setCorrection(TypicalLEDStrip);
  FastLED.setBrightness(BRIGHTNESS);
  FastLED.setMaxPowerInVoltsAndMilliamps(5, MAX_MA);

  fill_solid(leds, NUM_LEDS, CRGB::Black);
  FastLED.show();

  Serial.println("[ESP32] ArtTEC LED v1.0 ready");
  setState(S_IDLE);
}

// ══════════════════════════════════════════════════════════════
//  Main loop
// ══════════════════════════════════════════════════════════════
void loop() {
  readSerial();

  if (currentState != S_LIDAR) {
    runAnimation();
  }

  unsigned long now = millis();
  if (now - lastTelemMs >= 1000) {
    // "T:fps,state"
    Serial.print("T:");
    Serial.print(lidarFrames);
    Serial.print(",");
    Serial.println(STATE_NAMES[currentState]);
    lidarFrames  = 0;
    lastTelemMs  = now;
  }
}

// ══════════════════════════════════════════════════════════════
//  Serial parsing
// ══════════════════════════════════════════════════════════════
void readSerial() {
  while (Serial.available()) {
    uint8_t b = Serial.read();

    if (inBinary) {
      // Accumulate RGB payload
      rxBuf[rxLen++] = b;
      if (rxLen >= LIDAR_PAYLOAD) {
        handleLidarPacket();
        inBinary = false;
        rxLen    = 0;
      }

    } else {
      if (rxLen == 1 && rxBuf[0] == PROTO_H1 && b == PROTO_H2) {
        // Binary header confirmed — switch to binary mode
        inBinary = true;
        rxLen    = 0;

      } else if (b == PROTO_H1) {
        // Possible binary header start — park it
        rxBuf[0] = b;
        rxLen    = 1;

      } else if (b == '\n') {
        // End of ASCII command
        rxBuf[rxLen] = '\0';
        if (rxLen > 0) handleCommand((const char*)rxBuf);
        rxLen = 0;

      } else if (b >= 0x20 && b < 0x7F) {
        // Printable ASCII
        if (rxLen < (int)(sizeof(rxBuf) - 1)) rxBuf[rxLen++] = b;

      } else {
        // Unexpected byte — discard line buffer
        rxLen = 0;
      }
    }
  }
}

void handleCommand(const char* cmd) {
  for (uint8_t i = 0; i < S_COUNT; i++) {
    if (strcmp(cmd, STATE_NAMES[i]) == 0) {
      setState((State)i);
      return;
    }
  }
}

void handleLidarPacket() {
  if (currentState != S_LIDAR) setState(S_LIDAR);

  for (int i = 0; i < LIDAR_LEDS; i++) {
    leds[i] = CRGB(rxBuf[i*3], rxBuf[i*3 + 1], rxBuf[i*3 + 2]);
  }
  // LEDs 92–95: off (not used by lidar protocol)
  for (int i = LIDAR_LEDS; i < NUM_LEDS; i++) leds[i] = CRGB::Black;

  FastLED.show();
  lidarFrames++;
}

// ══════════════════════════════════════════════════════════════
//  State transitions
// ══════════════════════════════════════════════════════════════
void setState(State s) {
  if (s == currentState) return;
  currentState = s;
  stateMs      = millis();
  Serial.print("[ESP32] state=");
  Serial.println(STATE_NAMES[s]);
}

// ══════════════════════════════════════════════════════════════
//  Animation dispatcher
// ══════════════════════════════════════════════════════════════
void runAnimation() {
  switch (currentState) {
    case S_IDLE:     animIdle();     break;
    case S_NAVIGATE: animNavigate(); break;
    case S_SUCCESS:  animSuccess();  break;
    case S_ERROR:    animError();    break;
    case S_CHARGING: animCharging(); break;
    case S_STANDBY:  animStandby();  break;
    case S_STOP:     animStop();     break;
    default: break;
  }
}

// ══════════════════════════════════════════════════════════════
//  Animations
// ══════════════════════════════════════════════════════════════

// ── IDLE ─────────────────────────────────────────────────────
//  Slow terracotta breath (3 s cycle, 12–50 % brightness)
//  Conveys: robot is alive, waiting, calm.
void animIdle() {
  unsigned long t     = millis();
  float         phase = (float)(t % 3000) / 3000.0f;
  float         wave  = 0.5f + 0.5f * sinf(phase * TWO_PI);   // 0..1
  uint8_t       bri   = 30 + (uint8_t)(wave * 95);             // 30..125

  CRGB c = C_TERRACOTTA;
  c.nscale8(bri);
  fill_solid(leds, NUM_LEDS, c);
  FastLED.show();
}

// ── NAVIGATE ─────────────────────────────────────────────────
//  Terracotta comet chasing around the strip (full lap ≈ 0.77 s)
//  22-LED tail fades to amber — reads as purposeful forward motion.
void animNavigate() {
  static const int TAIL_LEN = 22;

  unsigned long t   = millis();
  int           pos = (int)((t / 8UL) % (unsigned long)NUM_LEDS);

  fill_solid(leds, NUM_LEDS, CRGB::Black);

  for (int i = 0; i < TAIL_LEN; i++) {
    int   idx   = (pos - i + NUM_LEDS) % NUM_LEDS;
    float ratio = (float)i / TAIL_LEN;             // 0 = head, 1 = tail
    uint8_t bri = (uint8_t)(255.0f * (1.0f - ratio * ratio));

    // Head: terracotta → tail: amber
    CRGB c;
    float t2 = (ratio < 0.45f) ? 0.0f : (ratio - 0.45f) / 0.55f;
    c.r = (uint8_t)(C_TERRACOTTA.r + (C_AMBER.r - C_TERRACOTTA.r) * t2);
    c.g = (uint8_t)(C_TERRACOTTA.g + (C_AMBER.g - C_TERRACOTTA.g) * t2);
    c.b = (uint8_t)(C_TERRACOTTA.b + (C_AMBER.b - C_TERRACOTTA.b) * t2);
    c.nscale8(bri);
    leds[idx] += c;
  }
  FastLED.show();
}

// ── SUCCESS ──────────────────────────────────────────────────
//  0–0.8 s : green sweep from LED 0 → 95
//  0.8–5 s : all LEDs pulse warm green (1.5 s cycle)
//  Distinct from the terracotta palette → "something different happened."
void animSuccess() {
  unsigned long elapsed = millis() - stateMs;

  if (elapsed < 800) {
    int progress = (int)((float)elapsed / 800.0f * NUM_LEDS);
    for (int i = 0; i < NUM_LEDS; i++) {
      leds[i] = (i <= progress) ? C_SUCCESS : CRGB::Black;
    }

  } else {
    float   phase = (float)((elapsed - 800) % 1500) / 1500.0f;
    float   wave  = 0.5f + 0.5f * sinf(phase * TWO_PI);
    uint8_t bri   = 70 + (uint8_t)(wave * 120);
    CRGB    c     = C_SUCCESS;
    c.nscale8(bri);
    fill_solid(leds, NUM_LEDS, c);
  }
  FastLED.show();
}

// ── ERROR ────────────────────────────────────────────────────
//  0–1.5 s : 3 sharp red flashes (250 ms on / 250 ms off)
//  1.5 s+  : slow urgent pulse (1.2 s cycle)
//  Red contrasts maximally with the warm terracotta identity.
void animError() {
  unsigned long elapsed = millis() - stateMs;

  if (elapsed < 1500) {
    bool on = ((elapsed % 500) < 250);
    fill_solid(leds, NUM_LEDS, on ? C_ERROR : CRGB::Black);

  } else {
    float   phase = (float)((elapsed - 1500) % 1200) / 1200.0f;
    float   wave  = 0.5f + 0.5f * sinf(phase * TWO_PI);
    uint8_t bri   = 55 + (uint8_t)(wave * 170);
    CRGB    c     = C_ERROR;
    c.nscale8(bri);
    fill_solid(leds, NUM_LEDS, c);
  }
  FastLED.show();
}

// ── CHARGING ─────────────────────────────────────────────────
//  A warm amber→terracotta band (bell-shaped intensity) scrolls
//  from LED 0 → 95 every 1.8 s over a very dim terracotta base.
//  Reads as energy flowing in.
void animCharging() {
  static const int   BAND  = 20;
  static const float CYCLE = 1800.0f;   // ms per full pass

  unsigned long t    = millis();
  float         prog = (float)(t % (unsigned long)CYCLE) / CYCLE;
  int           head = (int)(prog * (NUM_LEDS + BAND)) - BAND;

  fill_solid(leds, NUM_LEDS, C_BG_DIM);

  for (int i = 0; i < BAND; i++) {
    int idx = head + i;
    if (idx < 0 || idx >= NUM_LEDS) continue;

    float   pos  = (float)i / BAND;              // 0 = front, 1 = back
    float   bell = sinf(pos * PI);               // bell curve
    uint8_t bri  = (uint8_t)(bell * 215.0f);

    // Blend amber → terracotta across the band
    CRGB c;
    c.r = (uint8_t)(C_CHARGE_LO.r + (C_CHARGE_HI.r - C_CHARGE_LO.r) * pos);
    c.g = (uint8_t)(C_CHARGE_LO.g + (C_CHARGE_HI.g - C_CHARGE_LO.g) * pos);
    c.b = (uint8_t)(C_CHARGE_LO.b + (C_CHARGE_HI.b - C_CHARGE_LO.b) * pos);
    c.nscale8(bri);
    leds[idx] += c;
  }
  FastLED.show();
}

// ── STANDBY ──────────────────────────────────────────────────
//  All off. No active user session — conserve power.
void animStandby() {
  fill_solid(leds, NUM_LEDS, CRGB::Black);
  FastLED.show();
}

// ── STOP ─────────────────────────────────────────────────────
//  All off. Called on "stop\n" (robot shutdown).
void animStop() {
  fill_solid(leds, NUM_LEDS, CRGB::Black);
  FastLED.show();
}
