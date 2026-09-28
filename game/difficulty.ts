export const PLAYFIELD_GROUND_HEIGHT = 136;

export function obstacleSpeed(obstaclesPassed: number) {
  const cleared = Math.max(0, Math.floor(obstaclesPassed));
  if (cleared < 8) return 5.8 + cleared * 0.24;
  if (cleared < 20) return 7.72 + (cleared - 8) * 0.3;
  return Math.min(11.32 + (cleared - 20) * 0.12, 13.25);
}

export function maximumJumpHeight(screenHeight: number) {
  return Math.max(180, Math.min(310, screenHeight - PLAYFIELD_GROUND_HEIGHT - 190));
}

export function shouldShowHardObstacle(obstaclesPassed: number) {
  return obstaclesPassed >= 6;
}

export function nextObstacleLead(hard: boolean, previousWasHard: boolean) {
  if (hard) return 470;
  if (previousWasHard) return 420;
  return 325;
}
