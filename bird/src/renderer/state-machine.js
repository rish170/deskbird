/**
 * State machine and animation scheduler for Deskbird.
 * Drives frame selection based on bird states and sprite metadata.
 */

export const BIRD_STATES = {
  FOLLOWING: 'FOLLOWING',
  FLYING_TO_PERCH: 'FLYING_TO_PERCH',
  LANDING: 'LANDING',
  PERCHED_IDLE: 'PERCHED_IDLE',
  TAKEOFF: 'TAKEOFF'
};

export const FLAP_LOOP = ['flyUp', 'flyMid', 'flyDown', 'flyMid'];
export const TALK_FLAP_LOOP = ['flyUpTalk', 'flyMidTalk', 'flyDownTalk', 'flyMidTalk'];

export class BirdStateMachine {
  constructor(initialState = BIRD_STATES.FOLLOWING, options = {}) {
    this.state = initialState;
    this.stateTimer = 0;
    this.random = options.random || Math.random;
    this.now = options.now || (() => performance.now());

    // Schedulers for idle behaviors
    this.nextBlinkTime = this.scheduleNextBlink();
    this.isBlinking = false;
    this.blinkDuration = 160; // ms

    this.landingDuration = 200; // ms
    this.takeoffDuration = 250; // ms

    // Flap cycle timer
    this.flapTimer = 0;
  }

  scheduleNextBlink(currentTime = this.now()) {
    // 3 to 6 seconds
    const interval = 3000 + this.random() * 3000;
    return currentTime + interval;
  }

  transitionTo(nextState) {
    if (this.state === nextState) return;
    this.state = nextState;
    this.stateTimer = 0;
    this.isBlinking = false;

    const currentTime = this.now();
    if (nextState === BIRD_STATES.PERCHED_IDLE) {
      this.nextBlinkTime = this.scheduleNextBlink(currentTime);
    }
  }

  update(dt, isTalking = false, speed = 0) {
    const dtMs = dt * 1000;
    this.stateTimer += dtMs;
    const currentTime = this.now();

    // 1. FOLLOWING State (Flapping near cursor)
    if (this.state === BIRD_STATES.FOLLOWING) {
      // Flap speed increases slightly when moving fast (10 fps base up to 14 fps)
      const flapRate = Math.min(14, 10 + (speed / 400) * 4);
      this.flapTimer = (this.flapTimer + dt * flapRate) % FLAP_LOOP.length;
      const flapIndex = Math.floor(this.flapTimer);

      if (isTalking) {
        return TALK_FLAP_LOOP[flapIndex];
      }
      return FLAP_LOOP[flapIndex];
    }

    // 2. FLYING_TO_PERCH State
    if (this.state === BIRD_STATES.FLYING_TO_PERCH) {
      this.flapTimer = (this.flapTimer + dt * 12) % FLAP_LOOP.length;
      const flapIndex = Math.floor(this.flapTimer);
      return isTalking ? TALK_FLAP_LOOP[flapIndex] : FLAP_LOOP[flapIndex];
    }

    // 3. LANDING State
    if (this.state === BIRD_STATES.LANDING) {
      if (this.stateTimer >= this.landingDuration) {
        this.transitionTo(BIRD_STATES.PERCHED_IDLE);
        return 'perchIdle';
      }
      return this.stateTimer < this.landingDuration / 2 ? 'flyDown' : 'perchIdle';
    }

    // 4. TAKEOFF State
    if (this.state === BIRD_STATES.TAKEOFF) {
      if (this.stateTimer >= this.takeoffDuration) {
        this.transitionTo(BIRD_STATES.FOLLOWING);
        return 'flyUp';
      }
      return 'flyUp';
    }

    // 5. PERCHED_IDLE State (Sitting front-facing on perch)
    if (this.state === BIRD_STATES.PERCHED_IDLE) {
      if (isTalking) {
        // Alternate talking and closed mouth while speech bubble is typing
        return Math.floor(this.stateTimer / 120) % 2 === 0 ? 'perchTalk' : 'perchIdle';
      }

      // Check blink trigger
      if (currentTime >= this.nextBlinkTime) {
        if (!this.isBlinking) {
          this.isBlinking = true;
          this.blinkStart = currentTime;
        } else if (currentTime - this.blinkStart >= this.blinkDuration) {
          this.isBlinking = false;
          this.nextBlinkTime = this.scheduleNextBlink(currentTime);
        }
      }

      return this.isBlinking ? 'perchBlink' : 'perchIdle';
    }

    return 'flyUp';
  }
}
