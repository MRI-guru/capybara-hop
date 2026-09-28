import { supabase } from '../lib/supabase';

export async function ensurePlayerSession() {
  if (!supabase) return { connected: false as const, reason: 'not_configured' as const };
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (sessionData.session?.user) return { connected: true as const, userId: sessionData.session.user.id };

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) return { connected: false as const, reason: 'anonymous_auth_disabled' as const };
  return data.user
    ? { connected: true as const, userId: data.user.id }
    : { connected: false as const, reason: 'session_unavailable' as const };
}

