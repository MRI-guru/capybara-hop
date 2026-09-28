-- One-time weekly leaderboard prizes and the non-consumable automatic-ad preference.
alter table public.game_saves
  add column if not exists ads_removed boolean not null default false;

create table if not exists public.leaderboard_reward_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_key text not null,
  leaderboard_mode text not null check (leaderboard_mode in ('standard', 'boosted')),
  final_rank integer not null check (final_rank between 1 and 50),
  reward_acorns integer not null check (reward_acorns between 1 and 1000),
  claimed_at timestamptz not null default now(),
  primary key (user_id, period_key)
);

alter table public.leaderboard_reward_claims enable row level security;

create policy "Players read own leaderboard rewards"
  on public.leaderboard_reward_claims
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.leaderboard_reward_claims to authenticated;

create or replace function public.claim_previous_leaderboard_reward()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_period text := to_char(timezone('utc', now()) - interval '7 days', 'IYYY-"W"IW');
  v_rank integer;
  v_mode text;
  v_reward integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  if exists (
    select 1 from public.leaderboard_reward_claims
    where user_id = v_user_id and period_key = v_period
  ) then
    return jsonb_build_object('claimed', false, 'reward', 0, 'rank', null, 'period_key', v_period, 'reason', 'already_claimed');
  end if;

  with ranked as (
    select
      user_id,
      leaderboard_mode,
      rank() over (partition by leaderboard_mode order by best_score desc) as final_rank
    from public.leaderboard_entries
    where period_key = v_period
  )
  select final_rank::integer, leaderboard_mode
    into v_rank, v_mode
  from ranked
  where user_id = v_user_id and final_rank <= 50
  order by final_rank asc, leaderboard_mode asc
  limit 1;

  if v_rank is null then
    return jsonb_build_object('claimed', false, 'reward', 0, 'rank', null, 'period_key', v_period, 'reason', 'not_eligible');
  end if;

  v_reward := case
    when v_rank = 1 then 1000
    when v_rank = 2 then 750
    when v_rank = 3 then 500
    when v_rank <= 10 then 300
    when v_rank <= 20 then 150
    else 75
  end;

  insert into public.leaderboard_reward_claims
    (user_id, period_key, leaderboard_mode, final_rank, reward_acorns)
  values (v_user_id, v_period, v_mode, v_rank, v_reward);

  update public.game_saves
  set acorns = acorns + v_reward, updated_at = now()
  where user_id = v_user_id;

  return jsonb_build_object('claimed', true, 'reward', v_reward, 'rank', v_rank, 'period_key', v_period);
end;
$$;

revoke all on function public.claim_previous_leaderboard_reward() from public, anon;
grant execute on function public.claim_previous_leaderboard_reward() to authenticated;

-- Triple-hop runs can legitimately earn 30 hops per obstacle. Keep validation
-- strict while allowing boosts and collectible bonuses.
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
  if p_score > (p_obstacles_passed * 45 + 100) then raise exception 'Score exceeds plausible run maximum'; end if;
  if p_obstacles_passed > 0 and p_duration_ms < p_obstacles_passed * 250 then raise exception 'Run duration is not plausible'; end if;

  select count(*) into v_recent_count
  from public.game_runs
  where user_id = v_user_id and created_at > now() - interval '2 seconds';
  if v_recent_count > 0 then raise exception 'Please wait before submitting another run'; end if;

  insert into public.game_runs (user_id, score, leaderboard_mode, duration_ms, obstacles_passed)
  values (v_user_id, p_score, p_mode, p_duration_ms, p_obstacles_passed);

  insert into public.leaderboard_entries (user_id, leaderboard_mode, period_key, display_name, best_score)
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
