import { supabase } from '../lib/supabase';

export type CloudSave = {
  bestScore: number;
  acorns: number;
  selected: string;
  owned: string[];
  displayName: string;
  boosters: Record<string, number>;
  rewardedAds: { date: string; acorns: number; boosters: number };
  selectedWorld: string;
  worldBests: Record<string, number>;
  settings: Record<string, boolean>;
  progress: Record<string, unknown>;
};

export async function uploadCloudSave(save: CloudSave) {
  if (!supabase) return { synced: false, reason: 'not_configured' as const };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { synced: false, reason: 'not_signed_in' as const };
  const { error } = await supabase.from('game_saves').upsert({
    user_id: user.id,
    best_score: save.bestScore,
    acorns: save.acorns,
    selected_outfit: save.selected,
    owned_outfits: save.owned,
    display_name: save.displayName,
    shield_boosters: save.boosters.shield ?? 0,
    slow_boosters: save.boosters.slow ?? 0,
    continue_boosters: save.boosters.continue ?? 0,
    triple_boosters: save.boosters.triple ?? 0,
    rewarded_ads: save.rewardedAds,
    selected_world: save.selectedWorld,
    world_bests: save.worldBests,
    settings: save.settings,
    progress: save.progress,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return { synced: true as const };
}

export async function downloadCloudSave(): Promise<CloudSave | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('game_saves').select('best_score, acorns, selected_outfit, owned_outfits, display_name, shield_boosters, slow_boosters, continue_boosters, triple_boosters, rewarded_ads, selected_world, world_bests, settings, progress').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data ? {
    bestScore: data.best_score,
    acorns: data.acorns,
    selected: data.selected_outfit,
    owned: data.owned_outfits,
    displayName: data.display_name,
    boosters: { shield: data.shield_boosters, slow: data.slow_boosters, continue: data.continue_boosters, triple: data.triple_boosters },
    rewardedAds: data.rewarded_ads,
    selectedWorld: data.selected_world,
    worldBests: data.world_bests,
    settings: data.settings,
    progress: data.progress,
  } : null;
}
