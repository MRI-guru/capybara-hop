alter table public.game_saves
  add column if not exists last_interstitial_run integer not null default 0
  check (last_interstitial_run >= 0);
