export type MissionMetric = 'obstacles' | 'doubleJumps' | 'bonuses' | 'jaguars' | 'runs';
export type DailyMission = { id: string; label: string; metric: MissionMetric; goal: number; reward: number };
export type GameSettings = { music: boolean; sound: boolean; haptics: boolean };
export type ProgressData = {
  missionDate: string;
  daily: Record<MissionMetric, number>;
  claimedMissions: string[];
  streakDays: number;
  lastDailyClaim: string;
  achievements: string[];
  outfitMastery: Record<string, number>;
  runsCompleted: number;
  highestMilestone: number;
  tutorialComplete: boolean;
  profileComplete: boolean;
  firstPurchaseGift: boolean;
  journeyObstacles: number;
  journeyClaimed: number[];
  weekStart: string;
  weekly: Record<MissionMetric, number>;
  weeklyClaimed: string[];
  masteryClaimed: string[];
};

export const DEFAULT_SETTINGS: GameSettings = { music: true, sound: true, haptics: true };
const emptyDaily = (): Record<MissionMetric, number> => ({ obstacles: 0, doubleJumps: 0, bonuses: 0, jaguars: 0, runs: 0 });
export const dayKey = () => new Date().toISOString().slice(0, 10);
export function weekKey(date = dayKey()) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
}
export function getWeeklyChallenges(date = dayKey()): DailyMission[] {
  const alternate = Math.floor(Date.parse(`${weekKey(date)}T00:00:00Z`) / 604800000) % 2 === 0;
  return [
    { id: 'weekly-obstacles', label: 'Clear 100 obstacles', metric: 'obstacles', goal: 100, reward: 150 },
    { id: 'weekly-runs', label: 'Complete 10 runs', metric: 'runs', goal: 10, reward: 100 },
    alternate ? { id: 'weekly-bonuses', label: 'Catch 12 power-ups', metric: 'bonuses', goal: 12, reward: 125 }
      : { id: 'weekly-doubles', label: 'Perform 30 double jumps', metric: 'doubleJumps', goal: 30, reward: 125 },
  ];
}
export const MASTERY_REWARDS = [{ level: 3, reward: 30 }, { level: 5, reward: 60 }, { level: 10, reward: 150 }];

export const DEFAULT_PROGRESS: ProgressData = {
  missionDate: dayKey(),
  daily: emptyDaily(),
  claimedMissions: [],
  streakDays: 0,
  lastDailyClaim: '',
  achievements: [],
  outfitMastery: {},
  runsCompleted: 0,
  highestMilestone: 0,
  tutorialComplete: false,
  profileComplete: false,
  firstPurchaseGift: false,
  journeyObstacles: 0,
  journeyClaimed: [],
  weekStart: weekKey(),
  weekly: emptyDaily(),
  weeklyClaimed: [],
  masteryClaimed: [],
};

const missionSets: DailyMission[][] = [
  [
    { id: 'hop-20', label: 'Clear 20 obstacles', metric: 'obstacles', goal: 20, reward: 35 },
    { id: 'double-5', label: 'Use 5 double jumps', metric: 'doubleJumps', goal: 5, reward: 30 },
    { id: 'bonus-2', label: 'Catch 2 bonuses', metric: 'bonuses', goal: 2, reward: 30 },
  ],
  [
    { id: 'run-3', label: 'Complete 3 runs', metric: 'runs', goal: 3, reward: 30 },
    { id: 'hop-25', label: 'Clear 25 obstacles', metric: 'obstacles', goal: 25, reward: 40 },
    { id: 'jaguar-1', label: 'Escape 1 jaguar', metric: 'jaguars', goal: 1, reward: 35 },
  ],
  [
    { id: 'bonus-3', label: 'Catch 3 bonuses', metric: 'bonuses', goal: 3, reward: 40 },
    { id: 'double-8', label: 'Use 8 double jumps', metric: 'doubleJumps', goal: 8, reward: 40 },
    { id: 'run-2', label: 'Complete 2 runs', metric: 'runs', goal: 2, reward: 25 },
  ],
];

export function getDailyMissions(date = dayKey()) {
  const seed = Number(date.replaceAll('-', ''));
  return missionSets[seed % missionSets.length];
}

export function hydrateProgress(value?: Partial<ProgressData>, date = dayKey()): ProgressData {
  const merged = { ...DEFAULT_PROGRESS, ...value, daily: { ...emptyDaily(), ...(value?.daily ?? {}) }, weekly: { ...emptyDaily(), ...(value?.weekly ?? {}) }, outfitMastery: { ...(value?.outfitMastery ?? {}) } };
  if (merged.weekStart !== weekKey(date)) { merged.weekStart = weekKey(date); merged.weekly = emptyDaily(); merged.weeklyClaimed = []; }
  if (merged.missionDate !== date) return { ...merged, missionDate: date, daily: emptyDaily(), claimedMissions: [] };
  return merged;
}

export function applyRunProgress(progress: ProgressData, stats: { obstacles: number; doubleJumps: number; bonuses: number; jaguars: number; outfitId: string; score: number; countRun?: boolean }) {
  const next = hydrateProgress(progress);
  next.daily = {
    obstacles: next.daily.obstacles + stats.obstacles,
    doubleJumps: next.daily.doubleJumps + stats.doubleJumps,
    bonuses: next.daily.bonuses + stats.bonuses,
    jaguars: next.daily.jaguars + stats.jaguars,
    runs: next.daily.runs + (stats.countRun === false ? 0 : 1),
  };
  next.runsCompleted += stats.countRun === false ? 0 : 1;
  next.weekly = {
    obstacles: next.weekly.obstacles + stats.obstacles,
    doubleJumps: next.weekly.doubleJumps + stats.doubleJumps,
    bonuses: next.weekly.bonuses + stats.bonuses,
    jaguars: next.weekly.jaguars + stats.jaguars,
    runs: next.weekly.runs + (stats.countRun === false ? 0 : 1),
  };
  next.journeyObstacles += Math.max(0, stats.obstacles);
  next.outfitMastery = { ...next.outfitMastery, [stats.outfitId]: (next.outfitMastery[stats.outfitId] ?? 0) + stats.obstacles };
  const achievements = new Set(next.achievements);
  if (stats.score >= 250) achievements.add('Forest Flyer');
  if (stats.doubleJumps >= 5) achievements.add('Double Trouble');
  if (stats.bonuses >= 3) achievements.add('Snack Collector');
  if (stats.jaguars >= 1) achievements.add('Jaguar Escape');
  if (next.runsCompleted >= 25) achievements.add('Persistent Cappy');
  next.achievements = [...achievements];
  return next;
}

export function claimMission(progress: ProgressData, mission: DailyMission) {
  progress = hydrateProgress(progress);
  if (progress.claimedMissions.includes(mission.id) || progress.daily[mission.metric] < mission.goal) return { progress, reward: 0 };
  return { progress: { ...progress, claimedMissions: [...progress.claimedMissions, mission.id] }, reward: mission.reward };
}

export const JOURNEY_REWARDS = [
  { goal: 25, reward: 50 }, { goal: 75, reward: 100 },
  { goal: 150, reward: 150 }, { goal: 300, reward: 250 },
  { goal: 500, reward: 400 }, { goal: 1000, reward: 750 },
];
export function claimJourney(progress: ProgressData, goal: number) {
  const next = hydrateProgress(progress);
  const tier = JOURNEY_REWARDS.find(item => item.goal === goal);
  if (!tier || next.journeyObstacles < goal || next.journeyClaimed.includes(goal)) return { progress: next, reward: 0 };
  return { progress: { ...next, journeyClaimed: [...next.journeyClaimed, goal] }, reward: tier.reward };
}

export function claimDailyReward(progress: ProgressData) {
  const today = dayKey();
  if (progress.lastDailyClaim === today) return { progress, reward: 0 };
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const continued = progress.lastDailyClaim === yesterday.toISOString().slice(0, 10);
  const streakDays = continued ? Math.min(progress.streakDays + 1, 7) : 1;
  return { progress: { ...progress, lastDailyClaim: today, streakDays }, reward: 20 + streakDays * 5 };
}

export function milestoneReward(progress: ProgressData, score: number) {
  const milestone = Math.floor(score / 250) * 250;
  if (milestone <= progress.highestMilestone) return { progress, reward: 0, milestone: 0 };
  const steps = Math.max(1, (milestone - progress.highestMilestone) / 250);
  return { progress: { ...progress, highestMilestone: milestone }, reward: steps * 25, milestone };
}

export const masteryLevel = (points: number) => Math.min(10, Math.floor(points / 25) + 1);

export function claimWeekly(progress: ProgressData, id: string, expectedWeek: string, date = dayKey()) {
  const next = hydrateProgress(progress, date);
  const challenge = getWeeklyChallenges(date).find(item => item.id === id);
  if (expectedWeek !== next.weekStart || !challenge || next.weeklyClaimed.includes(id) || next.weekly[challenge.metric] < challenge.goal) return { progress: next, reward: 0 };
  return { progress: { ...next, weeklyClaimed: [...next.weeklyClaimed, id] }, reward: challenge.reward };
}
export function claimMastery(progress: ProgressData, outfitId: string, level: number) {
  const next = hydrateProgress(progress);
  const tier = MASTERY_REWARDS.find(item => item.level === level);
  const key = `${outfitId}:${level}`;
  if (!tier || masteryLevel(next.outfitMastery[outfitId] ?? 0) < level || next.masteryClaimed.includes(key)) return { progress: next, reward: 0 };
  return { progress: { ...next, masteryClaimed: [...next.masteryClaimed, key] }, reward: tier.reward };
}

export const environmentForScore = (score: number) => {
  if (score >= 1000) return 'volcano';
  if (score >= 750) return 'snow';
  if (score >= 500) return 'jungle';
  if (score >= 250) return 'beach';
  return 'forest';
};
