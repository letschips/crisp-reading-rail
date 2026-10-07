export const SPRING_STIFFNESS = 380;
export const SPRING_DAMPING = 24;
export const SPRING_REST_DELTA = 0.08;
export const SPRING_REST_SPEED = 0.5;
export const MAX_FRAME_DELTA = 1 / 30;

export const WAVE_AMPLITUDE = 19.6;
export const WAVE_SIGMA = 34;
export const WAVE_DYNAMIC_RADIUS = 119;

export interface SpringState {
  position: number;
  velocity: number;
}

export function stepSpring(
  state: SpringState,
  target: number,
  frameDelta: number,
): SpringState {
  const delta = Math.min(MAX_FRAME_DELTA, Math.max(0, frameDelta));
  const acceleration =
    SPRING_STIFFNESS * (target - state.position) -
    SPRING_DAMPING * state.velocity;
  const velocity = state.velocity + acceleration * delta;

  return {
    position: state.position + velocity * delta,
    velocity,
  };
}

export function isSpringSettled(
  state: SpringState,
  target: number,
): boolean {
  return (
    Math.abs(target - state.position) <= SPRING_REST_DELTA &&
    Math.abs(state.velocity) <= SPRING_REST_SPEED
  );
}

export function gaussianWaveOffset(
  centerY: number,
  itemY: number,
  sigma = WAVE_SIGMA,
  amplitude = WAVE_AMPLITUDE,
): number {
  const distance = itemY - centerY;
  return amplitude * Math.exp(-(distance * distance) / (2 * sigma * sigma));
}

export function isWithinWaveRadius(
  centerY: number,
  itemY: number,
  radius = WAVE_DYNAMIC_RADIUS,
): boolean {
  return Math.abs(itemY - centerY) <= radius;
}
