-- Predictions League — schema
-- Season-scoped from day one. This runs again next August.

create table if not exists seasons (
  id          serial primary key,
  label       text        not null unique,
  lock_at     timestamptz not null,
  starts_on   date,
  ends_on     date,
  is_active   boolean     not null default false
);

-- Only one active season at a time.
create unique index if not exists seasons_one_active
  on seasons (is_active) where is_active;

create table if not exists entrants (
  id                serial primary key,
  season_id         integer not null references seasons(id) on delete cascade,
  display_name      text    not null,
  slug              text    not null,
  magic_token       text    not null unique,
  club_affiliation  text,
  avatar_url        text,
  created_at        timestamptz not null default now(),
  unique (season_id, slug)
);

create table if not exists questions (
  id            serial primary key,
  season_id     integer not null references seasons(id) on delete cascade,
  key           text    not null,
  label         text    not null,
  help_text     text,
  input_type    text    not null
                check (input_type in ('club','club_ordered','club_set','free_text')),
  slot_count    integer not null default 1 check (slot_count > 0),
  sort_order    integer not null,
  points_config jsonb   not null default '{}'::jsonb,
  unique (season_id, key)
);

create table if not exists picks (
  id                  serial primary key,
  season_id           integer not null references seasons(id) on delete cascade,
  entrant_id          integer not null references entrants(id) on delete cascade,
  question_id         integer not null references questions(id) on delete cascade,
  slot_index          integer not null default 0,
  raw_value           text,   -- exactly what was typed or selected
  canonical_club      text,   -- set for club questions
  canonical_player_id text,   -- populated manually after lock, never fuzzy-matched
  edited_by_admin_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (entrant_id, question_id, slot_index)
);

create index if not exists picks_season_entrant on picks (season_id, entrant_id);

create table if not exists pick_audit (
  id             serial primary key,
  pick_id        integer references picks(id) on delete set null,
  entrant_id     integer,
  question_key   text,
  slot_index     integer,
  previous_value text,
  new_value      text,
  changed_by     text not null,
  reason         text,
  changed_at     timestamptz not null default now()
);

create index if not exists pick_audit_pick on pick_audit (pick_id, changed_at desc);

create table if not exists outcomes (
  id              serial primary key,
  season_id       integer not null references seasons(id) on delete cascade,
  question_id     integer not null references questions(id) on delete cascade,
  slot_index      integer not null default 0,
  canonical_value text,
  resolved_at     timestamptz,
  resolved_by     text,
  unique (question_id, slot_index)
);

-- Wildcard is unscoreable by default; a group vote can award its points to
-- specific entrants at season end. One row per awarded entrant.
create table if not exists wildcard_awards (
  id         serial primary key,
  season_id  integer not null references seasons(id) on delete cascade,
  entrant_id integer not null references entrants(id) on delete cascade,
  points     integer not null default 0,
  awarded_at timestamptz not null default now(),
  awarded_by text,
  unique (entrant_id)
);

-- Phase 2. Present so the shape is settled, unused for now.
create table if not exists standings_snapshot (
  id          serial primary key,
  season_id   integer not null references seasons(id) on delete cascade,
  matchweek   integer,
  payload     jsonb not null,
  captured_at timestamptz not null default now()
);

create table if not exists scorers_snapshot (
  id          serial primary key,
  season_id   integer not null references seasons(id) on delete cascade,
  matchweek   integer,
  payload     jsonb not null,
  captured_at timestamptz not null default now()
);
