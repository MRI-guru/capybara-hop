-- Keep leaderboard display names family-friendly even if a client is modified.
create or replace function public.capybara_name_allowed(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  not (regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]', '', 'g')
    ~ '(fuck|shit|bitch|asshole|bastard|dick|piss|cunt|nigger|nigga|fag|slut|whore|cock|porn|rape|nazi|retard|admin|moderator|support|official)')
$$;

create or replace function public.submit_capybara_run(
  p_score integer,
  p_mode text,
  p_duration_ms integer,
  p_obstacles_passed integer,
  p_display_name text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := trim(p_display_name);
  v_week text := to_char(timezone('utc', now()), 'IYYY-"W"IW');
  v_recent_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_mode not in ('standard', 'boosted') then raise exception 'Invalid leaderboard mode'; end if;
  if char_length(v_name) not between 2 and 20 then raise exception 'Display name must be 2-20 characters'; end if;
  if not public.capybara_name_allowed(v_name) then raise exception 'Display name is not allowed'; end if;
  if p_score < 0 or p_obstacles_passed < 0 or p_duration_ms < 1000 then raise exception 'Invalid run data'; end if;
  if p_score > (p_obstacles_passed * 25 + 50) then raise exception 'Score exceeds plausible run maximum'; end if;
  if p_obstacles_passed > 0 and p_duration_ms < p_obstacles_passed * 250 then raise exception 'Run duration is not plausible'; end if;

  select count(*) into v_recent_count from public.game_runs where user_id = v_user_id and created_at > now() - interval '2 seconds';
  if v_recent_count > 0 then raise exception 'Please wait before submitting another run'; end if;

  insert into public.game_runs (user_id, score, leaderboard_mode, duration_ms, obstacles_passed)
  values (v_user_id, p_score, p_mode, p_duration_ms, p_obstacles_passed);
  insert into public.leaderboard_entries (user_id, leaderboard_mode, period_key, display_name, best_score)
  values (v_user_id, p_mode, 'all-time', v_name, p_score), (v_user_id, p_mode, v_week, v_name, p_score)
  on conflict (user_id, leaderboard_mode, period_key)
  do update set display_name = excluded.display_name, best_score = greatest(public.leaderboard_entries.best_score, excluded.best_score), updated_at = now();
end;
$$;

revoke all on function public.capybara_name_allowed(text) from public, anon;
grant execute on function public.capybara_name_allowed(text) to authenticated;
revoke all on function public.submit_capybara_run(integer, text, integer, integer, text) from public, anon;
grant execute on function public.submit_capybara_run(integer, text, integer, integer, text) to authenticated;
