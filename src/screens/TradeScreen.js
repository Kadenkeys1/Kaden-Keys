import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PriceChart from '../components/PriceChart';
import { colors } from '../theme/colors';
import { computeDeterministicHistory, spreadForRigTier } from '../engine/priceEngine';
import { getOrCreatePlayer, getAccountsForPlayer, recordTrade } from '../services/playerService';

// Fixed genesis so every install computes the same price path.
// (Move to a DB-driven value later if you want to reset the "season".)
const MARKET = {
  symbol: 'ARCD-FUT',
  seed: 918273645,
  startPrice: 5000,
  volatility: 0.0015,
  drift: 0.00002,
  genesisMs: Date.UTC(2026, 0, 1),
};

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 32;

export default function TradeScreen() {
  const [player, setPlayer] = useState(null);
  const [account, setAccount] = useState(null);
  const [history, setHistory] = useState([]);
  const [price, setPrice] = useState(MARKET.startPrice);
  const [position, setPosition] = useState(null); // { side, qty, entryPrice, openedAt }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await getOrCreatePlayer();
        setPlayer(p);
        const accounts = await getAccountsForPlayer(p.id);
        setAccount(accounts[0]);
      } catch (e) {
        setError(e.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    function refresh() {
      const { price: p, history: h } = computeDeterministicHistory({
        seed: MARKET.seed,
        startPrice: MARKET.startPrice,
        volatility: MARKET.volatility,
        drift: MARKET.drift,
        genesisMs: MARKET.genesisMs,
      });
      setPrice(p);
      setHistory(h);
    }
    refresh();
    const id = setInterval(refresh, 500);
    return () => clearInterval(id);
  }, []);

  const spread = spreadForRigTier(player?.rig_tier ?? 1, price);
  const buyPrice = price + spread / 2;
  const sellPrice = price - spread / 2;

  const openPosition = useCallback(
    (side) => {
      if (position) return;
      const fillPrice = side === 'long' ? buyPrice : sellPrice;
      setPosition({ side, qty: 1, entryPrice: fillPrice, openedAt: new Date().toISOString() });
    },
    [position, buyPrice, sellPrice]
  );

  const closePosition = useCallback(async () => {
    if (!position || !account || busy) return;
    setBusy(true);
    const exitPrice = position.side === 'long' ? sellPrice : buyPrice;
    try {
      const pnl = await recordTrade({
        playerId: player.id,
        accountId: account.id,
        symbol: MARKET.symbol,
        side: position.side,
        qty: position.qty,
        entryPrice: position.entryPrice,
        exitPrice,
        openedAt: position.openedAt,
      });
      setAccount((a) => ({ ...a, balance: Math.max(0, Number(a.balance) + pnl) }));
      setPosition(null);
    } catch (e) {
      setError(e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [position, account, player, buyPrice, sellPrice, busy]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.dim}>Connecting to your account...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>Couldn't connect: {error}</Text>
      </SafeAreaView>
    );
  }

  const unrealized = position
    ? (price - position.entryPrice) * position.qty * (position.side === 'long' ? 1 : -1)
    : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.symbol}>{MARKET.symbol}</Text>
          <Text style={styles.price}>${price.toFixed(2)}</Text>
        </View>
        <View style={styles.balanceBox}>
          <Text style={styles.dim}>Account Balance</Text>
          <Text style={styles.balance}>${Number(account.balance).toFixed(2)}</Text>
        </View>
      </View>

      <View style={styles.chartCard}>
        <PriceChart history={history} width={CHART_WIDTH} height={240} />
      </View>

      <View style={styles.quoteRow}>
        <Text style={styles.dimSmall}>Bid ${sellPrice.toFixed(2)}</Text>
        <Text style={styles.dimSmall}>Spread ${spread.toFixed(2)} (Rig Tier {player.rig_tier})</Text>
        <Text style={styles.dimSmall}>Ask ${buyPrice.toFixed(2)}</Text>
      </View>

      {position ? (
        <View style={styles.positionCard}>
          <Text style={styles.dim}>
            {position.side.toUpperCase()} {position.qty} @ ${position.entryPrice.toFixed(2)}
          </Text>
          <Text style={[styles.pnl, { color: unrealized >= 0 ? colors.green : colors.red }]}>
            {unrealized >= 0 ? '+' : ''}
            ${unrealized.toFixed(2)}
          </Text>
          <Pressable style={[styles.btn, styles.closeBtn]} onPress={closePosition} disabled={busy}>
            <Text style={styles.btnText}>{busy ? 'Closing...' : 'Close Position'}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actionRow}>
          <Pressable style={[styles.btn, styles.sellBtn]} onPress={() => openPosition('short')}>
            <Text style={styles.btnText}>Sell / Short</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.buyBtn]} onPress={() => openPosition('long')}>
            <Text style={styles.btnText}>Buy / Long</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  symbol: { color: colors.textDim, fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  price: { color: colors.text, fontSize: 32, fontWeight: '700', marginTop: 2 },
  balanceBox: { alignItems: 'flex-end' },
  balance: { color: colors.text, fontSize: 20, fontWeight: '700' },
  dim: { color: colors.textDim, fontSize: 13 },
  dimSmall: { color: colors.textDim, fontSize: 11 },
  errorText: { color: colors.red, textAlign: 'center', paddingHorizontal: 24 },
  chartCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
  },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingHorizontal: 4,
  },
  positionCard: {
    marginTop: 20,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    alignItems: 'center',
    gap: 6,
  },
  pnl: { fontSize: 24, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: 24 },
  btn: { flex: 1, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  buyBtn: { backgroundColor: colors.green },
  sellBtn: { backgroundColor: colors.red },
  closeBtn: { backgroundColor: colors.accent, alignSelf: 'stretch', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
