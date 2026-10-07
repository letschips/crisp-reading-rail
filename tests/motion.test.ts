import { describe, expect, it } from "vitest";
import {
  MAX_FRAME_DELTA,
  WAVE_AMPLITUDE,
  gaussianWaveOffset,
  isSpringSettled,
  isWithinWaveRadius,
  stepSpring,
} from "../src/motion";

describe("reading rail motion", () => {
  it("converges a damped spring on its target", () => {
    let state = { position: 0, velocity: 0 };

    for (let index = 0; index < 240; index += 1) {
      state = stepSpring(state, 320, 1 / 60);
    }

    expect(state.position).toBeCloseTo(320, 3);
    expect(state.velocity).toBeCloseTo(0, 3);
    expect(isSpringSettled(state, 320)).toBe(true);
  });

  it("clamps long frame deltas before integrating", () => {
    const initial = { position: 10, velocity: 5 };

    expect(stepSpring(initial, 200, 1)).toEqual(
      stepSpring(initial, 200, MAX_FRAME_DELTA),
    );
  });

  it("recognizes both position and speed rest thresholds", () => {
    expect(isSpringSettled({ position: 99.95, velocity: 0.4 }, 100)).toBe(true);
    expect(isSpringSettled({ position: 99.8, velocity: 0.4 }, 100)).toBe(false);
    expect(isSpringSettled({ position: 99.95, velocity: 0.8 }, 100)).toBe(false);
  });

  it("peaks at the orb and decays symmetrically", () => {
    expect(gaussianWaveOffset(50, 50)).toBeCloseTo(WAVE_AMPLITUDE);
    expect(gaussianWaveOffset(50, 75)).toBeCloseTo(
      gaussianWaveOffset(50, 25),
    );
    expect(gaussianWaveOffset(50, 100)).toBeLessThan(
      gaussianWaveOffset(50, 75),
    );
  });

  it("limits dynamic wave work to the approved radius", () => {
    expect(isWithinWaveRadius(50, 169)).toBe(true);
    expect(isWithinWaveRadius(50, 170)).toBe(false);
  });
});
