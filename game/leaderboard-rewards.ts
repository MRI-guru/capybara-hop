export type LeaderboardRewardTier = {
  label: string;
  minRank: number;
  maxRank: number;
  acorns: number;
};

export const LEADERBOARD_REWARD_TIERS: LeaderboardRewardTier[] = [
  { label: '1st place', minRank: 1, maxRank: 1, acorns: 1000 },
  { label: '2nd place', minRank: 2, maxRank: 2, acorns: 750 },
  { label: '3rd place', minRank: 3, maxRank: 3, acorns: 500 },
  { label: '4th–10th', minRank: 4, maxRank: 10, acorns: 300 },
  { label: '11th–20th', minRank: 11, maxRank: 20, acorns: 150 },
  { label: '21st–50th', minRank: 21, maxRank: 50, acorns: 75 },
];

export function leaderboardRewardForRank(rank: number) {
  return LEADERBOARD_REWARD_TIERS.find(tier => rank >= tier.minRank && rank <= tier.maxRank)?.acorns ?? 0;
}
