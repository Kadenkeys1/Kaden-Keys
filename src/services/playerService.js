import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabaseClient';

const DEVICE_ID_KEY = 'trading-arcade-device-id';

async function getOrCreateDeviceId() {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// Starter account templates. Real-money purchases (IAP, wired up later)
// will let players unlock the larger sizes -- but note earnings/leaderboard
// rank only ever come from realized_pnl on trades, never from the purchase.
export const ACCOUNT_TEMPLATES = [
  { size: 5000, name: '5K Starter', costUsd: 0, dailyLossLimit: 250, maxDrawdown: 500 },
  { size: 25000, name: '25K Challenge', costUsd: 0.99, dailyLossLimit: 1000, maxDrawdown: 2000 },
  { size: 50000, name: '50K Challenge', costUsd: 1.99, dailyLossLimit: 2000, maxDrawdown: 4000 },
  { size: 100000, name: '100K Challenge', costUsd: 3.99, dailyLossLimit: 4000, maxDrawdown: 8000 },
];

export async function getOrCreatePlayer() {
  const deviceId = await getOrCreateDeviceId();

  const { data: existing, error: fetchErr } = await supabase
    .from('players')
    .select('*')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (existing) return existing;

  const { data: created, error: createErr } = await supabase
    .from('players')
    .insert({ device_id: deviceId })
    .select('*')
    .single();

  if (createErr) throw createErr;

  // give every new player a free 5K starter account
  const starter = ACCOUNT_TEMPLATES[0];
  await supabase.from('accounts').insert({
    player_id: created.id,
    account_size: starter.size,
    balance: starter.size,
    starting_balance: starter.size,
    daily_loss_limit: starter.dailyLossLimit,
    max_drawdown: starter.maxDrawdown,
  });

  return created;
}

export async function getAccountsForPlayer(playerId) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('player_id', playerId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function recordTrade({
  playerId,
  accountId,
  symbol,
  side,
  qty,
  entryPrice,
  exitPrice,
  openedAt,
}) {
  const pnl = (exitPrice - entryPrice) * qty * (side === 'long' ? 1 : -1);

  const { error: tradeErr } = await supabase.from('trades').insert({
    player_id: playerId,
    account_id: accountId,
    symbol,
    side,
    qty,
    entry_price: entryPrice,
    exit_price: exitPrice,
    pnl,
    opened_at: openedAt,
  });
  if (tradeErr) throw tradeErr;

  const { data: acct, error: acctErr } = await supabase
    .from('accounts')
    .select('balance, realized_pnl')
    .eq('id', accountId)
    .single();
  if (acctErr) throw acctErr;

  const newBalance = Math.max(0, Number(acct.balance) + pnl);
  const newRealized = Number(acct.realized_pnl) + pnl;

  const { error: updateErr } = await supabase
    .from('accounts')
    .update({ balance: newBalance, realized_pnl: newRealized })
    .eq('id', accountId);
  if (updateErr) throw updateErr;

  return pnl;
}
