import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'trading-arcade-save-v1';

const RIG_TIERS = [
  { tier: 1, name: 'Dell from 2011', cost: 0 },
  { tier: 2, name: 'Refurbished Office PC', cost: 500 },
  { tier: 3, name: 'Budget Gaming Rig', cost: 2500 },
  { tier: 4, name: 'Dual Monitor Battlestation', cost: 10000 },
  { tier: 5, name: 'Wall Street Terminal', cost: 50000 },
];

const ACHIEVEMENTS = [
  { id: 'first_trade', name: 'First Trade', desc: 'Place your first trade', check: (s) => s.stats.totalTrades >= 1 },
  { id: 'first_profit', name: 'In The Green', desc: 'Close a winning trade', check: (s) => s.stats.winningTrades >= 1 },
  { id: 'ten_k', name: '10K Club', desc: 'Reach $10,000 cash', check: (s) => s.cash >= 10000 },
  { id: 'rugged', name: 'Rugged', desc: 'Get hit by a meme coin rug pull', check: (s) => s.stats.rugsHit >= 1 },
  { id: 'liquidated', name: 'Liquidated', desc: 'Blow up an account to $0', check: (s) => s.stats.liquidations >= 1 },
  { id: 'streak_5', name: 'On Fire', desc: '5 winning trades in a row', check: (s) => s.stats.bestWinStreak >= 5 },
];

const initialState = {
  cash: 5000,
  rigTier: 1,
  position: null, // { symbol, side: 'long'|'short', qty, entryPrice }
  memePosition: null,
  stats: {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    totalPnl: 0,
    rugsHit: 0,
    liquidations: 0,
    winStreak: 0,
    bestWinStreak: 0,
  },
  unlockedAchievements: [],
};

export const useGameStore = create((set, get) => ({
  ...initialState,

  async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) set(JSON.parse(raw));
    } catch (e) {
      // ignore, start fresh
    }
  },

  persist() {
    const { cash, rigTier, stats, unlockedAchievements } = get();
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ cash, rigTier, stats, unlockedAchievements })
    ).catch(() => {});
  },

  buyRig(tier) {
    const rig = RIG_TIERS.find((r) => r.tier === tier);
    const { cash, rigTier } = get();
    if (!rig || tier <= rigTier || cash < rig.cost) return false;
    set({ cash: cash - rig.cost, rigTier: tier });
    get().persist();
    return true;
  },

  openPosition(symbol, side, qty, price) {
    if (get().position) return; // one position at a time for MVP
    set({ position: { symbol, side, qty, entryPrice: price } });
  },

  closePosition(exitPrice) {
    const { position, cash, stats } = get();
    if (!position) return;
    const dir = position.side === 'long' ? 1 : -1;
    const pnl = (exitPrice - position.entryPrice) * position.qty * dir;
    const newStats = { ...stats };
    newStats.totalTrades += 1;
    newStats.totalPnl += pnl;
    if (pnl > 0) {
      newStats.winningTrades += 1;
      newStats.winStreak += 1;
      newStats.bestWinStreak = Math.max(newStats.bestWinStreak, newStats.winStreak);
    } else {
      newStats.losingTrades += 1;
      newStats.winStreak = 0;
    }
    const newCash = Math.max(0, cash + pnl);
    if (newCash === 0) newStats.liquidations += 1;
    set({ position: null, cash: newCash, stats: newStats });
    get().checkAchievements();
    get().persist();
    return pnl;
  },

  openMemePosition(symbol, qty, price) {
    if (get().memePosition) return;
    set({ memePosition: { symbol, qty, entryPrice: price } });
  },

  closeMemePosition(exitPrice, wasRugged) {
    const { memePosition, cash, stats } = get();
    if (!memePosition) return;
    const pnl = (exitPrice - memePosition.entryPrice) * memePosition.qty;
    const newStats = { ...stats };
    newStats.totalTrades += 1;
    newStats.totalPnl += pnl;
    if (wasRugged) newStats.rugsHit += 1;
    if (pnl > 0) {
      newStats.winningTrades += 1;
      newStats.winStreak += 1;
      newStats.bestWinStreak = Math.max(newStats.bestWinStreak, newStats.winStreak);
    } else {
      newStats.losingTrades += 1;
      newStats.winStreak = 0;
    }
    const newCash = Math.max(0, cash + pnl);
    if (newCash === 0) newStats.liquidations += 1;
    set({ memePosition: null, cash: newCash, stats: newStats });
    get().checkAchievements();
    get().persist();
    return pnl;
  },

  checkAchievements() {
    const state = get();
    const unlocked = new Set(state.unlockedAchievements);
    let changed = false;
    ACHIEVEMENTS.forEach((a) => {
      if (!unlocked.has(a.id) && a.check(state)) {
        unlocked.add(a.id);
        changed = true;
      }
    });
    if (changed) set({ unlockedAchievements: Array.from(unlocked) });
  },

  resetGame() {
    set(initialState);
    get().persist();
  },
}));

export { RIG_TIERS, ACHIEVEMENTS };
