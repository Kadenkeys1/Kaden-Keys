# Trading Arcade — Handoff Notes

## What this is
Prop-firm-style mobile trading game (Expo/React Native, iOS + Android).
Player gets a fake-cash "account" (like a prop firm challenge), trades a
shared simulated chart, earns BUCKS (gem currency) from challenges to buy
upgrades or new accounts, and can buy extra fake-cash accounts cheaply with
real money via IAP (not yet wired up). Only realized trading P&L counts for
leaderboard/earnings — never purchases.

## Status as of this handoff
- Expo app scaffolded (`trading-arcade/`), blank JS template.
- Supabase backend live (schema in `supabase/schema.sql`, already run).
  Tables: players, accounts, price_ticks (unused now, see below),
  news_events (not yet used), trades.
- Deterministic shared price engine (`src/engine/priceEngine.js`):
  every client computes the identical price at the identical wall-clock
  moment from a fixed seed + genesis timestamp — no live ticker server
  needed. Runs at 2x real-time speed per the design brief.
- `src/services/playerService.js`: device-id-based player identity
  (no real auth yet), starter 5K account auto-created, `recordTrade()`
  writes to `trades` + updates `accounts.balance`.
- `src/screens/TradeScreen.js`: working single-market trade screen —
  shows live shared chart, bid/ask spread (driven by rig tier), one
  open position at a time, buy/sell/close wired to Supabase.
- `src/store/gameStore.js`: an earlier **local-only** zustand store
  (cash/rig/achievements) — this predates the Supabase pivot and is
  now partially redundant with playerService. Needs reconciling:
  probably keep zustand for UI/session state but make Supabase the
  source of truth for balance/trades.

## Not built yet (in priority-ish order)
1. Wire TradeScreen into actual navigation (bottom tabs: Trade, News,
   Leaderboard, Upgrades/Rig, Accounts). Only TradeScreen exists.
2. Multiple purchasable account sizes (25K/50K/100K) — templates
   already defined in `playerService.js` (`ACCOUNT_TEMPLATES`), just
   not exposed in UI or wired to IAP yet.
3. Account rules: daily loss limit / max drawdown enforcement + pass/fail
   status (columns exist in `accounts` table, logic not implemented).
4. BUCKS economy: challenges, achievements, what BUCKS can buy.
5. News page: scheduled events including a joke CPI-equivalent that
   nudges the price feed. `news_events` table exists, no client or
   scheduling logic yet.
6. Meme coin simulator: separate riskier chart, most coins rug-pull
   to near-zero. `priceEngine.js` originally had rug-pull support in
   the old non-deterministic `createMarket()` — needs porting to the
   deterministic model (rug event should probably be a scheduled
   news_event so it's also shared/synced).
7. Leaderboards: multiple stats, multiple account-size brackets.
   Query `trades`/`accounts` grouped by account_size.
8. Rig tier purchases (upgrade UI) — `spreadForRigTier()` exists,
   no purchase flow.
9. Real-money IAP for extra accounts (Apple In-App Purchase — this is
   an Apple Developer Program + StoreKit integration, separate setup
   from everything above).
10. Apple Developer account + App Store submission — not started.

## Credentials / accounts (owned by Kaden, not stored by Claude)
- GitHub: https://github.com/Kadenkeys1/Kaden-Keys.git
- Supabase project: dhqpdsgogffjarybijfh (Kaden has URL + anon key
  saved in his own `.env`; service_role key should be rotated after
  initial schema setup since it was shared in plaintext chat).

## Notes on decisions made
- Chose deterministic clock-driven pricing over a live server ticker
  to get "same chart for everyone" for free (no hosting cost, no
  server to keep alive). Tradeoff: harder to do true real-time news
  shocks that persist — a fired news event needs to be baked into the
  deterministic function (e.g. as a discrete jump term keyed by
  event timestamp) rather than just nudging a live variable.
