-- Reserve one unique, family-friendly leaderboard name per authenticated player.
create or replace function public.capybara_normalize_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    translate(lower(trim(coalesce(p_name, ''))), '@431!0$57', 'aaeiiosst'),
    '[^a-z0-9]', '', 'g'
  )
$$;

create or replace function public.capybara_name_allowed(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    trim(coalesce(p_name, '')) ~ '^[A-Za-z0-9 _-]{2,20}$'
    and char_length(public.capybara_normalize_name(p_name)) >= 2
    and not (public.capybara_normalize_name(p_name)
      ~ '(fuck|shit|bitch|asshole|bastard|dick|piss|cunt|nigger|nigga|fag|slut|whore|cock|porn|rape|nazi|retard|admin|moderator|support|official|penis|vagina|kkk|hitler)')
$$;

create table if not exists public.player_names (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 20),
  normalized_name text not null unique check (char_length(normalized_name) >= 2),
  updated_at timestamptz not null default now()
);

alter table public.player_names enable row level security;
drop policy if exists "Players read own reserved name" on public.player_names;
create policy "Players read own reserved name" on public.player_names
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.player_names to authenticated;

-- Preserve existing players. If legacy names collide, keep the oldest name and
-- append a short stable player code to later duplicates.
with source_names as (
  select
    gs.user_id,
    trim(gs.display_name) as original_name,
    public.capybara_normalize_name(gs.display_name) as original_normalized,
    row_number() over (
      partition by public.capybara_normalize_name(gs.display_name)
      order by gs.updated_at asc, gs.user_id asc
    ) as duplicate_number
  from public.game_saves gs
), prepared_names as (
  select
    user_id,
    case when duplicate_number = 1
      then left(original_name, 20)
      else left(original_name, 11) || ' ' || upper(left(replace(user_id::text, '-', ''), 8))
    end as reserved_name
  from source_names
)
insert into public.player_names (user_id, display_name, normalized_name)
select user_id, reserved_name, public.capybara_normalize_name(reserved_name)
from prepared_names
on conflict (user_id) do nothing;

update public.game_saves gs
set display_name = pn.display_name
from public.player_names pn
where pn.user_id = gs.user_id and gs.display_name is distinct from pn.display_name;

update public.leaderboard_entries le
set display_name = pn.display_name, updated_at = now()
from public.player_names pn
where pn.user_id = le.user_id and le.display_name is distinct from pn.display_name;

create or replace function public.claim_capybara_name(p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := trim(p_display_name);
  v_normalized text := public.capybara_normalize_name(p_display_name);
begin
  if v_user_id is null then
    return jsonb_build_object('success', false, 'reason', 'not_signed_in');
  end if;
  if char_length(v_name) not between 2 and 20 or v_name !~ '^[A-Za-z0-9 _-]+$' or char_length(v_normalized) < 2 then
    return jsonb_build_object('success', false, 'reason', 'invalid');
  end if;
  if not public.capybara_name_allowed(v_name) then
    return jsonb_build_object('success', false, 'reason', 'not_allowed');
  end if;

  begin
    insert into public.player_names (user_id, display_name, normalized_name, updated_at)
    values (v_user_id, v_name, v_normalized, now())
    on conflict (user_id) do update
      set display_name = excluded.display_name,
          normalized_name = excluded.normalized_name,
          updated_at = now();
  exception when unique_violation then
    return jsonb_build_object('success', false, 'reason', 'taken');
  end;

  update public.game_saves set display_name = v_name, updated_at = now() where user_id = v_user_id;
  update public.leaderboard_entries set display_name = v_name, updated_at = now() where user_id = v_user_id;
  return jsonb_build_object('success', true, 'display_name', v_name);
end;
$$;

revoke all on function public.capybara_normalize_name(text) from public, anon, authenticated;
revoke all on function public.capybara_name_allowed(text) from public, anon;
grant execute on function public.capybara_name_allowed(text) to authenticated;
revoke all on function public.claim_capybara_name(text) from public, anon;
grant execute on function public.claim_capybara_name(text) to authenticated;

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
  v_name text;
  v_week text := to_char(timezone('utc', now()), 'IYYY-"W"IW');
  v_recent_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select display_name into v_name from public.player_names where user_id = v_user_id;
  if v_name is null then raise exception 'Choose a unique player name before submitting scores'; end if;
  if p_mode not in ('standard', 'boosted') then raise exception 'Invalid leaderboard mode'; end if;
  if p_score < 0 or p_obstacles_passed < 0 or p_duration_ms < 1000 then raise exception 'Invalid run data'; end if;
  if p_score > (p_obstacles_passed * 45 + 100) then raise exception 'Score exceeds plausible run maximum'; end if;
  if p_obstacles_passed > 0 and p_duration_ms < p_obstacles_passed * 250 then raise exception 'Run duration is not plausible'; end if;

  select count(*) into v_recent_count from public.game_runs
  where user_id = v_user_id and created_at > now() - interval '2 seconds';
  if v_recent_count > 0 then raise exception 'Please wait before submitting another run'; end if;

  insert into public.game_runs (user_id, score, leaderboard_mode, duration_ms, obstacles_passed)
  values (v_user_id, p_score, p_mode, p_duration_ms, p_obstacles_passed);
  insert into public.leaderboard_entries (user_id, leaderboard_mode, period_key, display_name, best_score)
  values
    (v_user_id, p_mode, 'all-time', v_name, p_score),
    (v_user_id, p_mode, v_week, v_name, p_score)
  on conflict (user_id, leaderboard_mode, period_key)
  do update set display_name = excluded.display_name,
    best_score = greatest(public.leaderboard_entries.best_score, excluded.best_score),
    updated_at = now();
end;
$$;

revoke all on function public.submit_capybara_run(integer, text, integer, integer, text) from public, anon;
grant execute on function public.submit_capybara_run(integer, text, integer, integer, text) to authenticated;
