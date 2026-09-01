// Simple simulated price engine.
// Produces a random-walk price series per symbol, with configurable
// volatility, drift, and (for meme coins) rug-pull risk.

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Deterministic, clock-driven market -------------------------------
// Every player's app computes the SAME price at the SAME wall-clock
// moment, with no server round-trip needed. This is what makes the
// chart "shared" across everyone without running a live ticker.
//
// A market is defined by a fixed genesis timestamp + seed. Given "now",
// we know exactly how many ticks have elapsed since genesis and can
// deterministically compute price #N by re-running the same PRNG path.
// To make this fast (not literally replay thousands of ticks every
// frame), we snapshot the RNG state every CHECKPOINT_INTERVAL ticks.
// For an MVP, we just fast-forward in a tight loop, which is cheap
// (well under a millisecond for a few thousand ticks).

const SIM_SECONDS_PER_REAL_SECOND = 2; // "twice as fast" as real markets

export function deterministicTickIndex(genesisMs, nowMs = Date.now()) {
  const elapsedRealSec = Math.max(0, (nowMs - genesisMs) / 1000);
  return Math.floor(elapsedRealSec * SIM_SECONDS_PER_REAL_SECOND);
}

export function computeDeterministicHistory({
  seed,
  startPrice,
  volatility,
  drift = 0,
  genesisMs,
  nowMs = Date.now(),
  windowTicks = 240, // how many recent ticks to keep for the chart
}) {
  const rand = mulberry32(seed);
  const targetTick = deterministicTickIndex(genesisMs, nowMs);

  function gaussian() {
    const u1 = Math.max(rand(), 1e-9);
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  let price = startPrice;
  const full = [price];
  for (let i = 0; i < targetTick; i++) {
    const shock = gaussian() * volatility * price;
    price = Math.max(0.0001, price + shock + drift * price);
    full.push(price);
  }

  return {
    price,
    tick: targetTick,
    history: full.slice(-windowTicks),
  };
}

export function createMarket({
  symbol,
  startPrice = 100,
  volatility = 0.002, // stddev of each tick as a fraction of price
  drift = 0, // slight upward/downward bias per tick
  isMeme = false,
  rugChance = 0, // probability per tick of a rug pull (meme coins only)
  seed = Date.now() % 100000,
}) {
  const rand = mulberry32(seed);

  let price = startPrice;
  let rugged = false;
  const history = [price];

  function gaussian() {
    // Box-Muller
    const u1 = Math.max(rand(), 1e-9);
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function tick() {
    if (rugged) {
      return { price, rugged: true, history };
    }

    if (isMeme && rugChance > 0 && rand() < rugChance) {
      rugged = true;
      price = price * (0.01 + rand() * 0.04); // crashes to 1-5% of value
      history.push(price);
      return { price, rugged: true, history };
    }

    const shock = gaussian() * volatility * price;
    const driftAmt = drift * price;
    price = Math.max(0.0001, price + shock + driftAmt);
    history.push(price);
    if (history.length > 500) history.shift();
    return { price, rugged: false, history };
  }

  function reset() {
    price = startPrice;
    rugged = false;
    history.length = 0;
    history.push(price);
  }

  return { symbol, tick, reset, get price() { return price; }, get rugged() { return rugged; }, history };
}

// Spread (in price units) shrinks as the player's "rig" tier goes up —
// this is the "better computer = tighter spread" mechanic.
export function spreadForRigTier(tier, basePrice) {
  const bps = {
    1: 25, // 0.25% spread on a bad rig
    2: 15,
    3: 8,
    4: 4,
    5: 1.5,
  }[tier] ?? 25;
  return (basePrice * bps) / 10000;
}
