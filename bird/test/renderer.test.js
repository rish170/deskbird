import { describe, it, expect } from 'vitest';
import {
  calculateFollowTarget,
  updateExponentialSmoothing,
  calculateFacing,
  calculateFlightArc,
  isPointInRect
} from '../src/renderer/physics.js';
import { BirdStateMachine, BIRD_STATES, FLAP_LOOP, TALK_FLAP_LOOP } from '../src/renderer/state-machine.js';

describe('Bird Renderer Physics', () => {
  it('places bird to the right of cursor in middle of screen', () => {
    const cursor = { x: 500, y: 500 };
    const res = calculateFollowTarget(cursor, 1920, 1080);
    expect(res.isFlipped).toBe(false);
    expect(res.targetX).toBeGreaterThan(cursor.x);
  });

  it('flips bird to the left of cursor near right screen edge', () => {
    const cursor = { x: 1850, y: 500 };
    const res = calculateFollowTarget(cursor, 1920, 1080);
    expect(res.isFlipped).toBe(true);
    expect(res.targetX).toBeLessThan(cursor.x);
  });

  it('exponential smoothing is frame-rate independent', () => {
    // 60 fps: two 16.6ms steps
    let pos60 = 0;
    const target = 100;
    const dt60 = 0.0166;
    pos60 = updateExponentialSmoothing(pos60, target, dt60, 5, 2000).position;
    pos60 = updateExponentialSmoothing(pos60, target, dt60, 5, 2000).position;

    // 30 fps: one 33.3ms step
    let pos30 = 0;
    const dt30 = 0.0333;
    pos30 = updateExponentialSmoothing(pos30, target, dt30, 5, 2000).position;

    // Positions should be virtually identical
    expect(Math.abs(pos60 - pos30)).toBeLessThan(1.0);
  });

  it('calculateFacing respects dead zones', () => {
    expect(calculateFacing('right', 50, 20)).toBe('right');
    expect(calculateFacing('right', -50, 20)).toBe('left');
    // Inside dead zone (-20 to 20): maintains current facing
    expect(calculateFacing('right', 5, 20)).toBe('right');
    expect(calculateFacing('left', -10, 20)).toBe('left');
  });

  it('calculateFlightArc produces curved trajectory', () => {
    const start = { x: 100, y: 500 };
    const end = { x: 900, y: 500 };
    const p0 = calculateFlightArc(start, end, 0);
    const pMid = calculateFlightArc(start, end, 0.5);
    const p1 = calculateFlightArc(start, end, 1);

    expect(p0.x).toBeCloseTo(start.x);
    expect(p1.x).toBeCloseTo(end.x);
    // Midpoint Y should be higher up (lower numerical Y) than start/end
    expect(pMid.y).toBeLessThan(start.y);
  });

  it('isPointInRect detects points with hysteresis padding', () => {
    const rect = { x: 100, y: 100, width: 50, height: 50 };
    expect(isPointInRect({ x: 120, y: 120 }, rect, 4)).toBe(true);
    // 2px outside border: inside because padding is 4px
    expect(isPointInRect({ x: 152, y: 120 }, rect, 4)).toBe(true);
    // 10px outside border: false
    expect(isPointInRect({ x: 170, y: 120 }, rect, 4)).toBe(false);
  });
});

describe('Bird State Machine', () => {
  it('cycles flight loop frames while FOLLOWING', () => {
    const sm = new BirdStateMachine(BIRD_STATES.FOLLOWING);
    const frame1 = sm.update(0.016, false, 0);
    expect(frame1).toBe('flyUp');

    // After 0.15s (at 10 fps, 1.5 frames)
    const frame2 = sm.update(0.15, false, 0);
    expect(FLAP_LOOP).toContain(frame2);
  });

  it('transitions from FLYING_TO_PERCH -> LANDING -> PERCHED_IDLE', () => {
    let mockTime = 1000;
    const sm = new BirdStateMachine(BIRD_STATES.FLYING_TO_PERCH, {
      now: () => mockTime,
      random: () => 0.5
    });

    sm.transitionTo(BIRD_STATES.LANDING);
    expect(sm.state).toBe(BIRD_STATES.LANDING);

    // After landingDuration (200ms)
    sm.update(0.25, false, 0);
    expect(sm.state).toBe(BIRD_STATES.PERCHED_IDLE);
  });

  it('triggers blink animation after scheduled time during perched idle', () => {
    let mockTime = 1000;
    const sm = new BirdStateMachine(BIRD_STATES.PERCHED_IDLE, {
      now: () => mockTime,
      random: () => 0.0 // minimum interval: 3000ms
    });

    // Advance time past blink schedule (3000ms)
    mockTime += 3500;
    const frame = sm.update(0.016, false, 0);
    expect(frame).toBe('perchBlink');

    // After blink duration (160ms)
    mockTime += 200;
    const nextFrame = sm.update(0.016, false, 0);
    expect(nextFrame).toBe('perchIdle');
  });

  it('transitions TAKEOFF -> FOLLOWING', () => {
    const sm = new BirdStateMachine(BIRD_STATES.TAKEOFF);
    // Advance past takeoff duration (250ms)
    sm.update(0.3, false, 0);
    expect(sm.state).toBe(BIRD_STATES.FOLLOWING);
  });

  it('shows talking flight frames when message is typing while flying', () => {
    const sm = new BirdStateMachine(BIRD_STATES.FOLLOWING);
    const f1 = sm.update(0.05, true, 0);
    expect(TALK_FLAP_LOOP).toContain(f1);
  });

  it('shows talking perched frames when message is typing while perched', () => {
    const sm = new BirdStateMachine(BIRD_STATES.PERCHED_IDLE);
    const f1 = sm.update(0.05, true, 0);
    expect(['perchTalk', 'perchIdle']).toContain(f1);
  });

  it('renderer module evaluates without ReferenceError or initialization exceptions', async () => {
    const mockEl = () => ({
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false
      },
      offsetWidth: 180,
      offsetHeight: 70,
      textContent: '',
      addEventListener: () => {}
    });

    globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
    globalThis.window = {
      innerWidth: 1920,
      innerHeight: 1080,
      addEventListener: () => {},
      requestAnimationFrame: globalThis.requestAnimationFrame,
      deskbirdApi: {
        onInit: () => {},
        onCursor: () => {},
        onPerchStateChanged: () => {},
        onTogglePerch: () => {},
        onMessage: () => {},
        onAnnouncement: () => {},
        onSettingUpdated: () => {},
        notifyInteractive: () => {},
        notifySeen: () => {},
        updateSetting: () => {}
      }
    };

    globalThis.document = {
      getElementById: () => mockEl(),
      documentElement: {
        style: {
          setProperty: () => {}
        }
      }
    };

    // Dynamically import renderer.js to verify TDZ and variable initialization
    await expect(import('../src/renderer/renderer.js')).resolves.toBeDefined();
  });
});
