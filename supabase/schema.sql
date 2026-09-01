-- Trading Arcade schema
-- Run this once in Supabase Dashboard -> SQL Editor -> New query -> Run

-- Players
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  device_id text unique not null,
  username text,
  bucks integer not null default 100,
  rig_tier integer not null default 1,
  created_at timestamptz not null default now()
);

-- Prop accounts (a player can own several: starter + purchased)
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  account_size integer not null,       -- e.g. 5000, 25000, 50000, 100000
  balance numeric not null,
  starting_balance numeric not null,
  status text not null default 'active', -- active | passed | failed
  daily_loss_limit numeric,
  max_drawdown numeric,
  realized_pnl numeric not null default 0,
  created_at timestamptz not null default now()
);

-- Shared, authoritative price ticks -- every client reads the same feed
create table if not exists price_ticks (
  id bigint generated always as identity primary key,
  symbol text not null,
  price numeric not null,
  ts timestamptz not null default now()
);
create index if not exists idx_price_ticks_symbol_ts on price_ticks(symbol, ts desc);

-- News events (scheduled, some real-style, some jokes -- e.g. the CPI stand-in)
create table if not exists news_events (
  id bigint generated always as identity primary key,
  headline text not null,
  body text,
  symbol_impact text,          -- which symbol it moves, if any
  impact_pct numeric,          -- e.g. -0.03 for a 3% shock
  is_joke boolean not null default false,
  fires_at timestamptz not null,
  fired boolean not null default false
);

-- Trade log (source of truth for leaderboard stats -- profit only, never purchases)
create table if not exists trades (
  id bigint generated always as identity primary key,
  player_id uuid references players(id) on delete cascade,
  account_id uuid references accounts(id) on delete cascade,
  symbol text not null,
  side text not null,          -- long | short
  qty numeric not null,
  entry_price numeric not null,
  exit_price numeric not null,
  pnl numeric not null,
  opened_at timestamptz not null,
  closed_at timestamptz not null default now()
);

-- Row Level Security: players can only touch their own rows.
-- (Using device_id-based auth for now; can upgrade to real auth later.)
alter table players enable row level security;
alter table accounts enable row level security;
alter table trades enable row level security;

create policy "players read own" on players for select using (true);
create policy "players insert self" on players for insert with check (true);
create policy "players update self" on players for update using (true);

create policy "accounts read own" on accounts for select using (true);
create policy "accounts insert" on accounts for insert with check (true);
create policy "accounts update" on accounts for update using (true);

create policy "trades read all" on trades for select using (true);
create policy "trades insert" on trades for insert with check (true);

-- price_ticks and news_events are public read-only from the client;
-- only written by the server-side price engine (service role).
alter table price_ticks enable row level security;
create policy "price_ticks public read" on price_ticks for select using (true);

alter table news_events enable row level security;
create policy "news_events public read" on news_events for select using (true);
