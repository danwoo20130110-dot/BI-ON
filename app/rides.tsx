import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  fetchRidePage,
  fetchRideTotals,
  refreshMyRides,
  type RideListItem,
  type RideTotals,
} from '@/hooks/my-rides-store';
import { Text } from '@/components/ui/text';

const ORANGE = '#FFA51F';
const PAGE = 30;

const pad2 = (n: number) => String(n).padStart(2, '0');
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const monthOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
};

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}시간 ${m}분` : `${m}분 ${pad2(Math.round(sec % 60))}초`;
}

function RideRow({ ride, showMonth }: { ride: RideListItem; showMonth: boolean }) {
  const st = ride.stat!;
  const d = new Date(st.at);
  const per = st.km > 0.01 ? Math.round(st.sec / st.km) : 0;
  return (
    <>
      {showMonth && <Text style={styles.month}>{monthOf(st.at)}</Text>}
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => router.push({ pathname: '/ride/[id]', params: { id: ride.id } })}
      >
        <View style={styles.dayBox}>
          <Text style={styles.day}>{d.getDate()}</Text>
          <Text style={styles.weekday}>{DAYS[d.getDay()]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.km}>
            {st.km.toFixed(2)}
            <Text style={styles.kmUnit}> km</Text>
          </Text>
          <Text style={styles.sub}>
            {pad2(d.getHours())}:{pad2(d.getMinutes())} · {formatDuration(st.sec)} · 평균 {st.avg.toFixed(1)}km/h
            {per > 0 ? ` · 1km ${Math.floor(per / 60)}'${pad2(per % 60)}"` : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#6A6A6A" />
      </Pressable>
    </>
  );
}

export default function RidesScreen() {
  const [rides, setRides] = useState<RideListItem[]>([]);
  const [totals, setTotals] = useState<RideTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const doneRef = useRef(false);
  const loadingMoreRef = useRef(false);

  const loadFirst = useCallback(async () => {
    // 아직 못 올린 기록이 있으면 먼저 올려서 목록에 함께 보이게
    await refreshMyRides().catch(() => {});
    const [page, t] = await Promise.all([fetchRidePage(null, PAGE), fetchRideTotals()]);
    setFailed(!page);
    if (page) {
      setRides(page);
      doneRef.current = page.length < PAGE;
    }
    if (t) setTotals(t);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFirst();
    }, [loadFirst]),
  );

  const loadMore = async () => {
    if (doneRef.current || loadingMoreRef.current || !rides.length) return;
    loadingMoreRef.current = true;
    const page = await fetchRidePage(rides[rides.length - 1].at, PAGE);
    loadingMoreRef.current = false;
    if (!page) return;
    doneRef.current = page.length < PAGE;
    setRides((r) => [...r, ...page]);
  };

  const refresh = async () => {
    setRefreshing(true);
    await loadFirst();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.title}>전체 라이딩 기록</Text>
        <View style={{ width: 26 }} />
      </View>

      {totals && totals.count > 0 && (
        <View style={styles.totals}>
          <View style={styles.total}>
            <Text style={styles.totalValue}>{totals.count}회</Text>
            <Text style={styles.totalLabel}>라이딩</Text>
          </View>
          <View style={styles.total}>
            <Text style={styles.totalValue}>{totals.km.toFixed(1)}km</Text>
            <Text style={styles.totalLabel}>총 거리</Text>
          </View>
          <View style={styles.total}>
            <Text style={styles.totalValue}>{formatDuration(totals.sec)}</Text>
            <Text style={styles.totalLabel}>총 시간</Text>
          </View>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color="#8A8A8A" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={rides}
          keyExtractor={(r) => r.id}
          renderItem={({ item, index }) => (
            <RideRow ride={item} showMonth={index === 0 || monthOf(rides[index - 1].at) !== monthOf(item.at)} />
          )}
          contentContainerStyle={styles.list}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#8A8A8A" />}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {failed ? '기록을 불러오지 못했어요. 아래로 당겨서 다시 시도해 주세요' : '아직 라이딩 기록이 없어요'}
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  totals: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#0D0D0D',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  total: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  totalValue: {
    color: ORANGE,
    fontSize: 16,
    fontWeight: '800',
  },
  totalLabel: {
    color: '#9A9A9A',
    fontSize: 12,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 8,
  },
  month: {
    color: '#BDBDBD',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#141414',
  },
  rowPressed: {
    backgroundColor: '#1F1F1F',
  },
  dayBox: {
    width: 40,
    alignItems: 'center',
  },
  day: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  weekday: {
    color: '#8A8A8A',
    fontSize: 11,
  },
  km: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  kmUnit: {
    fontSize: 13,
    fontWeight: '600',
  },
  sub: {
    color: '#9A9A9A',
    fontSize: 12,
    marginTop: 2,
  },
  empty: {
    color: '#8A8A8A',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
});
