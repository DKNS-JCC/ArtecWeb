
#include <FastLED.h>
#include <math.h>

#define LED_PIN     5
#define NUM_LEDS    96
#define LED_TYPE    WS2812B
#define COLOR_ORDER GRB
#define BRIGHTNESS  70
#define MAX_MA      2000


static const CRGB C_PRIMARY  = CRGB(200, 90,  5);   
static const CRGB C_ACCENT   = CRGB(230, 140, 10);  
static const CRGB C_WARM     = CRGB(180, 60,  0);   
static const CRGB C_BG_DIM   = CRGB( 25, 10,  0);   
static const CRGB C_SUCCESS  = CRGB( 55, 155, 40);
static const CRGB C_ERROR    = CRGB(220,  30, 10);
static const CRGB C_CHARGE   = CRGB(220, 160,  0);  

enum State : uint8_t {
  S_IDLE = 0, S_NAVIGATE, S_SUCCESS, S_ERROR,
  S_CHARGING, S_STANDBY, S_STOP, S_COUNT
};
static const char* STATE_NAMES[S_COUNT] = {
  "idle", "navigate", "success", "error", "charging", "standby", "stop"
};

static CRGB          leds[NUM_LEDS];
static State         currentState = S_IDLE;
static unsigned long stateMs      = 0;
static unsigned long lastTelemMs  = 0;
static char          rxBuf[32];
static int           rxLen = 0;


static int           chargeFill = 0;            
static unsigned long chargeLastPulseMs = 0;
static int           chargePulsePos = -1;

void setState(State s) {
  if (s == currentState) return;
  currentState = s;
  stateMs = millis();
  if (s == S_CHARGING) {
    chargeFill = 0;
    chargePulsePos = -1;
    chargeLastPulseMs = millis();
  }
  Serial.print("[ESP32] state=");
  Serial.println(STATE_NAMES[s]);
}

void handleCommand(const char* cmd) {
  for (uint8_t i = 0; i < S_COUNT; i++) {
    if (strcmp(cmd, STATE_NAMES[i]) == 0) { setState((State)i); return; }
  }
}

void readSerial() {
  while (Serial.available()) {
    uint8_t b = Serial.read();
    if (b == '\n' || b == '\r') {
      if (rxLen > 0) {
        rxBuf[rxLen] = '\0';
        handleCommand(rxBuf);
        rxLen = 0;
      }
    } else if (b >= 0x20 && b < 0x7F) {
      if (rxLen < (int)(sizeof(rxBuf) - 1)) rxBuf[rxLen++] = b;
    }
  }
}

void animIdle() {
  float phase = (float)(millis() % 3000) / 3000.0f;
  float wave  = 0.5f + 0.5f * sinf(phase * TWO_PI);
  uint8_t bri = 30 + (uint8_t)(wave * 95);
  CRGB c = C_PRIMARY;
  c.nscale8(bri);
  fill_solid(leds, NUM_LEDS, c);
  FastLED.show();
}

void animNavigate() {
  const int TAIL = 22;
  int pos = (int)((millis() / 8UL) % (unsigned long)NUM_LEDS);
  fill_solid(leds, NUM_LEDS, CRGB::Black);
  for (int i = 0; i < TAIL; i++) {
    int idx = (pos - i + NUM_LEDS) % NUM_LEDS;
    float r = (float)i / TAIL;
    uint8_t bri = (uint8_t)(255.0f * (1.0f - r * r));
    float blend = (r < 0.45f) ? 0.0f : (r - 0.45f) / 0.55f;
    CRGB c;
    c.r = (uint8_t)(C_PRIMARY.r + (C_ACCENT.r - C_PRIMARY.r) * blend);
    c.g = (uint8_t)(C_PRIMARY.g + (C_ACCENT.g - C_PRIMARY.g) * blend);
    c.b = (uint8_t)(C_PRIMARY.b + (C_ACCENT.b - C_PRIMARY.b) * blend);
    c.nscale8(bri);
    leds[idx] += c;
  }
  FastLED.show();
}

void animSuccess() {
  unsigned long elapsed = millis() - stateMs;
  if (elapsed < 800) {
    int progress = (int)((float)elapsed / 800.0f * NUM_LEDS);
    for (int i = 0; i < NUM_LEDS; i++)
      leds[i] = (i <= progress) ? C_SUCCESS : CRGB::Black;
  } else {
    float phase = (float)((elapsed - 800) % 1500) / 1500.0f;
    float wave  = 0.5f + 0.5f * sinf(phase * TWO_PI);
    uint8_t bri = 70 + (uint8_t)(wave * 120);
    CRGB c = C_SUCCESS;
    c.nscale8(bri);
    fill_solid(leds, NUM_LEDS, c);
  }
  FastLED.show();
}

void animError() {
  unsigned long elapsed = millis() - stateMs;
  if (elapsed < 1500) {
    bool on = ((elapsed % 500) < 250);
    fill_solid(leds, NUM_LEDS, on ? C_ERROR : CRGB::Black);
  } else {
    float phase = (float)((elapsed - 1500) % 1200) / 1200.0f;
    float wave  = 0.5f + 0.5f * sinf(phase * TWO_PI);
    uint8_t bri = 55 + (uint8_t)(wave * 170);
    CRGB c = C_ERROR;
    c.nscale8(bri);
    fill_solid(leds, NUM_LEDS, c);
  }
  FastLED.show();
}

void animCharging() {
  const int PULSE_WIDTH = 6;
  const unsigned long PULSE_SPEED_MS = 12;
  const unsigned long PAUSE_AFTER_STACK = 300;
  unsigned long now = millis();

  fill_solid(leds, NUM_LEDS, CRGB::Black);
  for (int i = 0; i < chargeFill; i++) {
    CRGB c = C_CHARGE;
    c.nscale8(140);
    leds[i] = c;
  }

  if (chargePulsePos < 0) {
    
    if (now - chargeLastPulseMs >= PAUSE_AFTER_STACK) {
      chargePulsePos = NUM_LEDS - 1 + PULSE_WIDTH;
      chargeLastPulseMs = now;
    }
  } else {
    
    if (now - chargeLastPulseMs >= PULSE_SPEED_MS) {
      chargeLastPulseMs = now;
      chargePulsePos--;
      if (chargePulsePos <= chargeFill) {
        int newFill = chargeFill + PULSE_WIDTH;
        if (newFill > NUM_LEDS) newFill = NUM_LEDS;
        for (int i = chargeFill; i < newFill; i++) {
          CRGB c = C_CHARGE;
          c.nscale8(140);
          leds[i] = c;
        }
        chargeFill = newFill;
        chargePulsePos = -1;
        if (chargeFill >= NUM_LEDS) {
          chargeFill = 0;
        }
      }
    }
    for (int i = 0; i < PULSE_WIDTH; i++) {
      int idx = chargePulsePos + i;
      if (idx < chargeFill || idx >= NUM_LEDS) continue;
      float t = (float)i / (PULSE_WIDTH - 1);
      float bell = sinf(t * PI);
      uint8_t bri = 80 + (uint8_t)(bell * 175);
      CRGB c = C_CHARGE;
      c.nscale8(bri);
      leds[idx] = c;
    }
  }
  FastLED.show();
}

void animOff() {
  fill_solid(leds, NUM_LEDS, CRGB::Black);
  FastLED.show();
}

void runAnimation() {
  switch (currentState) {
    case S_IDLE:     animIdle();     break;
    case S_NAVIGATE: animNavigate(); break;
    case S_SUCCESS:  animSuccess();  break;
    case S_ERROR:    animError();    break;
    case S_CHARGING: animCharging(); break;
    case S_STANDBY:  // fall through
    case S_STOP:     animOff();      break;
    default: break;
  }
}

void setup() {
  Serial.begin(115200);
  FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, NUM_LEDS)
         .setCorrection(TypicalLEDStrip);
  FastLED.setBrightness(BRIGHTNESS);
  FastLED.setMaxPowerInVoltsAndMilliamps(5, MAX_MA);
  fill_solid(leds, NUM_LEDS, CRGB::Black);
  FastLED.show();
  Serial.println("[ESP32] ArtTEC LED ready");
  setState(S_IDLE);
}

void loop() {
  readSerial();
  runAnimation();
  unsigned long now = millis();
  if (now - lastTelemMs >= 1000) {
    Serial.print("T:");
    Serial.println(STATE_NAMES[currentState]);
    lastTelemMs = now;
  }
}