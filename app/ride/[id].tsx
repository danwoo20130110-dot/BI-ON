import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { Splits } from '@/components/land-card';
import { RouteMap } from '@/components/route-map';
import { fetchRide, type RideListItem } from '@/hooks/my-rides-store';

const ORANGE = '#FFA51F';
const pad2 = (n: number) => String(n).padStart(2, '0');
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function formatDate(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} (${DAYS[d.getDay()]}) ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

function formatPace(km: number, sec: number) {
  if (km < 0.01) return '—';
  const per = Math.round(sec / km);
  return `${Math.floor(per / 60)}'${pad2(per % 60)}"`;
}

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>
        {value}
        {unit ? <Text style={styles.metricUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

export default function RideDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ride, setRide] = useState<RideListItem | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let alive = true;
    fetchRide(String(id)).then((r) => {
      if (!alive) return;
      setRide(r);
      setState(r ? 'ready' : 'missing');
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const st = ride?.stat;
  const route = (ride?.pts ?? []).map(([latitude, longitude]) => ({ latitude, longitude }));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.title}>라이딩 기록</Text>
        <View style={{ width: 26 }} />
      </View>

      {state === 'loading' && <ActivityIndicator color="#8A8A8A" style={{ marginTop: 40 }} />}
      {state === 'missing' && <Text style={styles.empty}>기록을 불러오지 못했어요</Text>}

      {st && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.date}>{formatDate(st.at)}</Text>
          <Text style={styles.heroValue}>
            {st.km.toFixed(2)}
            <Text style={styles.heroUnit}> km</Text>
          </Text>

          <View style={styles.card}>
            <RouteMap route={route} style={styles.map} />
          </View>

          <View style={styles.card}>
            <View style={styles.metricRow}>
              <Metric label="라이딩 시간" value={formatDuration(st.sec)} />
              <Metric label="평균 페이스" value={formatPace(st.km, st.sec)} unit="/km" />
            </View>
            <View style={styles.metricRow}>
              <Metric label="평균속력" value={st.avg.toFixed(1)} unit="km/h" />
              <Metric label="최고속력" value={Math.max(st.max, st.avg).toFixed(1)} unit="km/h" />
            </View>
            <View style={styles.metricRow}>
              <Metric label="상승 고도" value={`+${Math.round(st.gain)}`} unit="m" />
              <View style={styles.metric} />
            </View>
          </View>

          {(st.splits?.length || st.last) && (
            <View style={styles.card}>
              <Splits splits={st.splits ?? []} last={st.last ?? null} />
            </View>
          )}
        </ScrollView>
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
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 14,
  },
  date: {
    color: '#BDBDBD',
    fontSize: 13,
  },
  heroValue: {
    color: ORANGE,
    fontSize: 48,
    fontWeight: '800',
    marginTop: -6,
  },
  heroUnit: {
    fontSize: 20,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#0D0D0D',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 16,
    padding: 14,
    gap: 14,
  },
  map: {
    height: 240,
    borderRadius: 10,
  },
  metricRow: {
    flexDirection: 'row',
  },
  metric: {
    flex: 1,
    gap: 2,
  },
  metricLabel: {
    color: '#9A9A9A',
    fontSize: 12,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  metricUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: '#BDBDBD',
  },
  empty: {
    color: '#8A8A8A',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
});
