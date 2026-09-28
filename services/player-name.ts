import { supabase } from '../lib/supabase';

export type PlayerNameResult = {
  success: boolean;
  displayName?: string;
  reason?: 'taken' | 'not_allowed' | 'invalid' | 'not_signed_in' | 'not_configured' | 'unavailable';
};

export async function claimPlayerName(displayName: string): Promise<PlayerNameResult> {
  if (!supabase) return { success: false, reason: 'not_configured' };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, reason: 'not_signed_in' };
  const { data, error } = await supabase.rpc('claim_capybara_name', { p_display_name: displayName });
  if (error) return { success: false, reason: 'unavailable' };
  const result = (data ?? {}) as Record<string, unknown>;
  return {
    success: Boolean(result.success),
    displayName: typeof result.display_name === 'string' ? result.display_name : undefined,
    reason: typeof result.reason === 'string' ? result.reason as PlayerNameResult['reason'] : undefined,
  };
}

export async function getReservedPlayerName(): Promise<string | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('player_names').select('display_name').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data?.display_name ?? null;
}
