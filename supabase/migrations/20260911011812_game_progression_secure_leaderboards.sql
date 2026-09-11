-- Cloud progression, validated run history, weekly/all-time leaderboards,
-- separate standard/boosted boards, and private gameplay analytics.
-- Applied to project yyxrmmojjcvtrivxriaq as game_progression_secure_leaderboards.

alter table public.game_saves
  add column if not exists display_name text not null default 'Happy Capy'
    check (char_length(display_name) between 2 and 20),
  add column if not exists settings jsonb not null
    default '{"music":true,"sound":true,"haptics":true}'::jsonb
    check (jsonb_typeof(settings) = 'object'),
  add column if not exists progress jsonb not null default '{}'::jsonb
    check (jsonb_typeof(progress) = 'object');

create table if not exists public.game_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null check (score >= 0),
  leaderboard_mode text not null check (leaderboard_mode in ('standard', 'boosted')),
  duration_ms integer not null check (duration_ms between 1000 and 86400000),
  obstacles_passed integer not null check (obstacles_passed >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.leaderboard_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  leaderboard_mode text not null check (leaderboard_mode in ('standard', 'boosted')),
  period_key text not null,
  display_name text not null check (char_length(display_name) between 2 and 20),
  best_score integer not null check (best_score >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, leaderboard_mode, period_key)
);

create table if not exists public.game_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null check (char_length(event_name) between 2 and 48),
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists game_runs_user_created_idx on public.game_runs (user_id, created_at desc);
create index if not exists leaderboard_entries_rank_idx on public.leaderboard_entries (period_key, leaderboard_mode, best_score desc);
create index if not exists game_events_user_created_idx on public.game_events (user_id, created_at desc);

alter table public.game_runs enable row level security;
alter table public.leaderboard_entries enable row level security;
alter table public.game_events enable row level security;

create policy "Players read own runs" on public.game_runs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Leaderboards are public" on public.leaderboard_entries
  for select to anon, authenticated using (true);
create policy "Players create own events" on public.game_events
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Players read own events" on public.game_events
  for select to authenticated using ((select auth.uid()) = user_id);

grant select on public.leaderboard_entries to anon, authenticated;
grant select on public.game_runs to authenticated;
grant select, insert on public.game_events to authenticated;

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
  if p_score < 0 or p_obstacles_passed < 0 or p_duration_ms < 1000 then raise exception 'Invalid run data'; end if;
  if p_score > (p_obstacles_passed * 25 + 50) then raise exception 'Score exceeds plausible run maximum'; end if;
  if p_obstacles_passed > 0 and p_duration_ms < p_obstacles_passed * 250 then raise exception 'Run duration is not plausible'; end if;

  select count(*) into v_recent_count
  from public.game_runs
  where user_id = v_user_id and created_at > now() - interval '2 seconds';
  if v_recent_count > 0 then raise exception 'Please wait before submitting another run'; end if;

  insert into public.game_runs (user_id, score, leaderboard_mode, duration_ms, obstacles_passed)
  values (v_user_id, p_score, p_mode, p_duration_ms, p_obstacles_passed);

  insert into public.leaderboard_entries
    (user_id, leaderboard_mode, period_key, display_name, best_score)
  values
    (v_user_id, p_mode, 'all-time', v_name, p_score),
    (v_user_id, p_mode, v_week, v_name, p_score)
  on conflict (user_id, leaderboard_mode, period_key)
  do update set
    display_name = excluded.display_name,
    best_score = greatest(public.leaderboard_entries.best_score, excluded.best_score),
    updated_at = now();
end;
$$;

revoke all on function public.submit_capybara_run(integer, text, integer, integer, text) from public, anon;
grant execute on function public.submit_capybara_run(integer, text, integer, integer, text) to authenticated;
