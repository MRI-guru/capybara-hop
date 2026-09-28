import { supabase } from '../lib/supabase';

export async function trackGameEvent(eventName: string, properties: Record<string, string | number | boolean | null> = {}) {
  if (!supabase) return false;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { error } = await supabase.from('game_events').insert({ user_id: user.id, event_name: eventName, properties });
  if (error) throw error;
  return true;
}

