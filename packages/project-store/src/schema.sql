-- Relational shape of the catalogue the editor maintains.
--
-- The authoring model was a single nested JSON document. Splitting it into
-- tables is not decoration: it is what lets two editors work at once, what
-- makes "which media cover Jalisco" a query instead of a scan, and what turns
-- a class of ordering bug into something the schema forbids.

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text not null,
  name          text not null,
  created_at    timestamptz not null default now()
);

-- Keyed by the hash of the token, never by the token itself. Reading this
-- table gives an attacker nothing they can present as a cookie.
create table sessions (
  token_hash text primary key,
  user_id    uuid not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index sessions_expires_at_idx on sessions (expires_at);

create index sessions_user_id_idx on sessions (user_id);

-- The 32 states are a fixed catalogue. The old server rejected any attempt to
-- change them; here the absence of a write path says the same thing.
create table states (
  id       text primary key,
  name     text not null,
  position integer not null unique
);

-- Exactly one row, forever. The check constraint is what makes that true.
create table appearance (
  singleton              boolean primary key default true check (singleton),
  background_color       text not null,
  title_color            text not null,
  state_with_media_color text not null,
  state_disabled_color   text not null,
  state_hover_color      text not null,
  state_selected_color   text not null,
  coverage_origin_color  text not null,
  coverage_area_color    text not null,
  glow_color             text not null,
  glow_intensity         integer not null,
  glow_opacity           integer not null,
  -- double precision, not numeric: these are continuous display parameters,
  -- not money, and the driver hands numeric back as a string.
  glow_core_size         double precision not null,
  glow_spread            double precision not null,
  glow_outline           double precision not null,
  accent_color           text not null
);

create table media (
  id             text primary key,
  name           text not null,
  -- Derived from `name` by the legacy editor to build file paths. Kept so the
  -- import loses nothing; obsolete once storage is keyed by id.
  folder_slug    text not null default '',
  active         boolean not null default true,
  -- Null, not '', when unassigned: the absence of a state is not a state.
  state_id       text references states (id),
  notes          text not null default '',
  coverage_text  text not null default '',
  social_enabled boolean not null default false,
  position       integer not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index media_state_id_idx on media (state_id);

create table media_coverage_states (
  medium_id text not null references media (id) on delete cascade,
  state_id  text not null references states (id),
  position  integer not null,
  primary key (medium_id, state_id)
);

-- `witness_position` is shared with social_themes: files and themes compete
-- for one ordering space per medium, which is how the map presents them. The
-- legacy kept that order in a separate `witnessOrder` array that could drift
-- out of sync with the items it named. Here it cannot: there is no second
-- copy to disagree with.
create table media_files (
  id               text primary key,
  medium_id        text not null references media (id) on delete cascade,
  kind             text not null check (kind in ('imagen', 'video', 'audio')),
  -- A file row with no path is not a draft, it is corruption. The old
  -- generator silently skipped those; here they cannot be stored at all.
  path             text not null check (length(trim(path)) > 0),
  description      text not null default '',
  witness_position integer not null
);

create index media_files_medium_id_idx on media_files (medium_id);

create table social_themes (
  id               text primary key,
  medium_id        text not null references media (id) on delete cascade,
  title            text not null default '',
  instagram        text not null default '',
  facebook         text not null default '',
  x                text not null default '',
  tiktok           text not null default '',
  youtube          text not null default '',
  witness_position integer not null
);

create index social_themes_medium_id_idx on social_themes (medium_id);
