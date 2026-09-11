import { supabase } from '../lib/supabase';

export type LeaderboardMode = 'standard' | 'boosted';
export type LeaderboardPeriod = 'weekly' | 'all-time';
export type LeaderboardRow = { user_id?: string; display_name: string; best_score: number };

export const currentWeekKey = () => {
  const date = new Date();
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

export async function fetchLeaderboard(period: LeaderboardPeriod = 'all-time', mode: LeaderboardMode = 'standard'): Promise<LeaderboardRow[]> {
  if (!supabase) return [];
  const periodKey = period === 'weekly' ? currentWeekKey() : 'all-time';
  const { data, error } = await supabase
    .from('leaderboard_entries')
    .select('user_id, display_name, best_score')
    .eq('period_key', periodKey)
    .eq('leaderboard_mode', mode)
    .order('best_score', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function submitRun(input: { score: number; mode: LeaderboardMode; durationMs: number; obstaclesPassed: number; displayName: string }) {
  if (!supabase || input.obstaclesPassed <= 0) return false;
  const { error } = await supabase.rpc('submit_capybara_run', {
    p_score: input.score,
    p_mode: input.mode,
    p_duration_ms: Math.max(1000, Math.round(input.durationMs)),
    p_obstacles_passed: input.obstaclesPassed,
    p_display_name: input.displayName.trim(),
  });
  if (error) throw error;
  return true;
}
