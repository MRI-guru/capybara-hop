alter table public.game_saves
  add column if not exists selected_world text not null default 'forest'
    check (selected_world in ('forest', 'beach', 'jungle', 'snow', 'volcano')),
  add column if not exists world_bests jsonb not null
    default '{"forest":0,"beach":0,"jungle":0,"snow":0,"volcano":0}'::jsonb
    check (jsonb_typeof(world_bests) = 'object');
