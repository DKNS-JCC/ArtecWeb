/*
 * artec_leds_test.ino - Auto-cycle LED test for ArtTEC Kobuki robot
 *
 * Cycles through all LED states automatically every 5 seconds
 * to verify hardware and animations without ROS/Serial input.
 */

#include <FastLED.h>
#include <math.h>

#define LED_PIN      5
#define NUM_LEDS     96
#define LED_TYPE     WS2812B
#define COLOR_ORDER  GRB
#define BRIGHTNESS   70
#define MAX_MA       2000

// Palette
static const CRGB C_TERRACOTTA = CRGB(176,  70,  30);
static const CRGB C_AMBER      = CRGB(217, 116,  62);
static const CRGB C_DEEP       = CRGB(163,  54,  31);
static const CRGB C_SUCCESS    = CRGB( 55, 155,  40);
static const CRGB C_ERROR      = CRGB(220,  30,  10);
static const CRGB C_CHARGE_LO  = CRGB(210, 145,  30);
static const CRGB C_CHARGE_HI  = CRGB(176,  70,  30);
static const CRGB C_BG_DIM     = CRGB( 18,   7,   3);

enum State : uint8_t {
  S_IDLE = 0,
  S_NAVIGATE,
  S_SUCCESS,
  S_ERROR,
  S_CHARGING,
  S_STANDBY,
  S_COUNT
};

static const char* STATE_NAMES[S_COUNT] = {
  "idle", "navigate", "success", "error", "charging", "standby"
};

static CRGB  leds[NUM_LEDS];
static State currentState = S_IDLE;
static unsigned long stateMs = 0;
static unsigned long lastChangeMs = 0;
const unsigned long CYCLE_TIME_MS = 5000;

void setup() {
  Serial.begin(115200);

  FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, NUM_LEDS)
         .setCorrection(TypicalLEDStrip);
  FastLED.setBrightness(BRIGHTNESS);
  FastLED.setMaxPowerInVoltsAndMilliamps(5, MAX_MA);

  fill_solid(leds, NUM_LEDS, CRGB::Black);
  FastLED.show();

  Serial.println("[ESP32] Auto LED Test starting...");
  setState(S_IDLE);
}

void loop() {
  unsigned long now = millis();

  if (now - lastChangeMs >= CYCLE_TIME_MS) {
    lastChangeMs = now;
    uint8_t nextState = (currentState + 1) % S_COUNT;
    setState((State)nextState);
  }

  runAnimation();
}

void setState(State s) {
  currentState = s;
  stateMs      = millis();
  Serial.print("[Test] Switching to state: ");
  Serial.println(STATE_NAMES[s]);
}

void runAnimation() {
  switch (currentState) {
    case S_IDLE:     animIdle();     break;
    case S_NAVIGATE: animNavigate(); break;
    case S_SUCCESS:  animSuccess();  break;
    case S_ERROR:    animError();    break;
    case S_CHARGING: animCharging(); break;
    case S_STANDBY:  animStandby();  break;
    default: break;
  }
}

void animIdle() {
  unsigned long t     = millis();
  float         phase = (float)(t % 3000) / 3000.0f;
  float         wave  = 0.5f + 0.5f * sinf(phase * TWO_PI);
  uint8_t       bri   = 30 + (uint8_t)(wave * 95);

  CRGB c = C_TERRACOTTA;
  c.nscale8(bri);
  fill_solid(leds, NUM_LEDS, c);
  FastLED.show();
}

void animNavigate() {
  static const int TAIL_LEN = 22;
  unsigned long t   = millis();
  int           pos = (int)((t / 8UL) % (unsigned long)NUM_LEDS);

  fill_solid(leds, NUM_LEDS, CRGB::Black);

  for (int i = 0; i < TAIL_LEN; i++) {
    int   idx   = (pos - i + NUM_LEDS) % NUM_LEDS;
    float ratio = (float)i / TAIL_LEN;
    uint8_t bri = (uint8_t)(255.0f * (1.0f - ratio * ratio));

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

void animCharging() {
  static const int   BAND  = 20;
  static const float CYCLE = 1800.0f;

  unsigned long t    = millis();
  float         prog = (float)(t % (unsigned long)CYCLE) / CYCLE;
  int           head = (int)(prog * (NUM_LEDS + BAND)) - BAND;

  fill_solid(leds, NUM_LEDS, C_BG_DIM);

  for (int i = 0; i < BAND; i++) {
    int idx = head + i;
    if (idx < 0 || idx >= NUM_LEDS) continue;

    float   pos  = (float)i / BAND;
    float   bell = sinf(pos * PI);
    uint8_t bri  = (uint8_t)(bell * 215.0f);

    CRGB c;
    c.r = (uint8_t)(C_CHARGE_LO.r + (C_CHARGE_HI.r - C_CHARGE_LO.r) * pos);
    c.g = (uint8_t)(C_CHARGE_LO.g + (C_CHARGE_HI.g - C_CHARGE_LO.g) * pos);
    c.b = (uint8_t)(C_CHARGE_LO.b + (C_CHARGE_HI.b - C_CHARGE_LO.b) * pos);
    c.nscale8(bri);
    leds[idx] += c;
  }
  FastLED.show();
}

void animStandby() {
  fill_solid(leds, NUM_LEDS, CRGB::Black);
  FastLED.show();
}
