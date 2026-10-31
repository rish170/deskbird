/**
 * Physics and Math functions for Deskbird follow and flight behavior.
 */

export function calculateFollowTarget(cursor, displayWidth, displayHeight, state = {}, options = {}) {
  const followOffsetX = options.followOffsetX || 60;
  const followOffsetY = options.followOffsetY || -6;
  const birdWidth = options.birdWidth || 72;
  const rightEdgeMargin = options.rightEdgeMargin || 140;

  // Determine if bird should flip to left side of cursor
  const nearRightEdge = cursor.x >= displayWidth - rightEdgeMargin;
  const wouldOverflowRight = cursor.x + followOffsetX + birdWidth > displayWidth;
  const shouldFlip = nearRightEdge || wouldOverflowRight;

  const targetOffsetX = shouldFlip ? -followOffsetX - birdWidth : followOffsetX;

  // Smooth offset transition
  const currentOffsetX = state.currentOffsetX !== undefined ? state.currentOffsetX : targetOffsetX;
  const offsetDiff = targetOffsetX - currentOffsetX;
  const offsetSmoothingSpeed = options.offsetSmoothingSpeed || 10;
  const dt = options.dt || 0.016;
  const newOffsetX = currentOffsetX + offsetDiff * (1 - Math.exp(-offsetSmoothingSpeed * dt));

  // Hover bob (sine wave)
  const time = options.time || 0;
  const bobY = Math.sin(time * 3.5) * 3;

  // Subtle figure-8 drift when cursor is still
  const driftX = Math.sin(time * 1.5) * 4;
  const driftY = Math.sin(time * 3.0) * 2;

  let targetX = cursor.x + newOffsetX + driftX;
  let targetY = cursor.y + followOffsetY + bobY + driftY;

  // Clamp within display bounds with small margin
  targetX = Math.max(10, Math.min(displayWidth - birdWidth - 10, targetX));
  targetY = Math.max(10, Math.min(displayHeight - birdWidth - 10, targetY));

  return {
    targetX,
    targetY,
    currentOffsetX: newOffsetX,
    isFlipped: shouldFlip
  };
}

export function updateExponentialSmoothing(current, target, dt, speed = 8, maxSpeed = 800) {
  const diff = target - current;
  let step = diff * (1 - Math.exp(-speed * dt));

  // Cap max speed
  const maxStep = maxSpeed * dt;
  if (Math.abs(step) > maxStep) {
    step = Math.sign(step) * maxStep;
  }

  const newPos = current + step;
  const velocity = dt > 0 ? step / dt : 0;

  return {
    position: newPos,
    velocity
  };
}

export function calculateFacing(currentFacing, velocityX, deadZone = 20) {
  if (velocityX > deadZone) {
    return 'right';
  } else if (velocityX < -deadZone) {
    return 'left';
  }
  return currentFacing;
}

export function calculateFlightArc(startPos, endPos, progress) {
  const t = Math.max(0, Math.min(1, progress));
  // Control point is mid-way horizontally and arched upwards
  const midX = (startPos.x + endPos.x) / 2;
  const midY = Math.min(startPos.y, endPos.y) - 60;

  // Quadratic Bezier: (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
  const oneMinusT = 1 - t;
  const x = oneMinusT * oneMinusT * startPos.x + 2 * oneMinusT * t * midX + t * t * endPos.x;
  const y = oneMinusT * oneMinusT * startPos.y + 2 * oneMinusT * t * midY + t * t * endPos.y;

  return { x, y };
}

export function isPointInRect(point, rect, padding = 4) {
  return (
    point.x >= rect.x - padding &&
    point.x <= rect.x + rect.width + padding &&
    point.y >= rect.y - padding &&
    point.y <= rect.y + rect.height + padding
  );
}
