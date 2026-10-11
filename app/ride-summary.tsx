import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MiniLineChart } from '@/components/mini-line-chart';
import { RouteMap } from '@/components/route-map';
import { getLastRideSummary } from '@/hooks/ride-summary-store';

const ORANGE = '#FFA51F';
const SKY = '#5AC8FA';

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min ${String(s).padStart(2, '0')}s`;
}

function formatClock(sec: number) {
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, '0')}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function formatDate(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} (${DAYS[d.getDay()]})`;
}

function formatTime(ms: number) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// 평균 페이스 (1km 당 걸린 시간)
function formatPace(distanceKm: number, elapsedSec: number) {
  if (distanceKm < 0.01) return '—';
  const secPerKm = Math.round(elapsedSec / distanceKm);
  return `${Math.floor(secPerKm / 60)}'${pad2(secPerKm % 60)}"`;
}

const meters = (v: number | null) => (v == null ? '—' : `${Math.round(v)}`);

function Metric({ label, value, unit, color = '#FFFFFF', big }: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
  big?: boolean;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[big ? styles.metricBig : styles.metricValue, { color }]}>
        {value}
        {unit && <Text style={styles.metricUnit}> {unit}</Text>}
      </Text>
    </View>
  );
}

export default function RideSummaryScreen() {
  const summary = getLastRideSummary();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  if (!summary) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        <Text style={styles.muted}>표시할 라이딩 기록이 없어요</Text>
        <Pressable style={styles.doneButton} onPress={close}>
          <Text style={styles.doneLabel}>돌아가기</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const { startedAt, endedAt, stats, route, samples, lastLocation, startAddress, endAddress } =
    summary;
  const hasRoute = route.length >= 2;
  const avg = stats.avgSpeedKmh ?? 0;
  const max = Math.max(stats.maxSpeedKmh ?? 0, avg);
  const avgRatio = max > 0 ? avg / max : 0;

  // 그래프: 시작(0초) 지점을 포함해 최소 2개 점이 되도록
  const speedSeries = [0, ...samples.map((s) => s.speedKmh)];
  const altSeries = samples.map((s) => s.altitude).filter((a): a is number => a != null);
  if (altSeries.length === 1) altSeries.push(altSeries[0]);
  const endClock = formatClock(stats.elapsedSec);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>라이딩 통계</Text>
            <Text style={styles.subtitle}>
              {formatDate(startedAt)} · {formatTime(startedAt)} – {formatTime(endedAt)}
            </Text>
          </View>
          <Pressable onPress={close} hitSlop={10}>
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* 거리 + 시간 */}
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>주행거리</Text>
          <Text style={styles.heroValue}>
            {stats.distanceKm.toFixed(2)}
            <Text style={styles.heroUnit}> km</Text>
          </Text>
          <View style={styles.heroRow}>
            <Metric label="라이딩 시간" value={formatDuration(stats.elapsedSec)} />
            <Metric label="평균 페이스" value={formatPace(stats.distanceKm, stats.elapsedSec)} unit="/km" />
          </View>
        </View>

        {/* 지도 */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="map-outline" size={16} color={ORANGE} />
            <Text style={styles.cardTitle}>라이딩 경로</Text>
          </View>
          <View>
            <RouteMap route={route} center={lastLocation} style={styles.map} />
            {!hasRoute && (
              <View style={styles.mapBadge}>
                <Text style={styles.mapBadgeText}>이동 기록이 없어 현재 위치만 표시해요</Text>
              </View>
            )}
          </View>
          <View style={styles.locRow}>
            <View style={styles.dotStart} />
            <Text style={styles.locLabel}>출발</Text>
            <Text style={styles.locText} numberOfLines={1}>{startAddress ?? '—'}</Text>
          </View>
          <View style={styles.locRow}>
            <View style={styles.dotEnd} />
            <Text style={styles.locLabel}>도착</Text>
            <Text style={styles.locText} numberOfLines={1}>{endAddress ?? '—'}</Text>
          </View>
        </View>

        {/* 속도 */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="speedometer-outline" size={16} color={ORANGE} />
            <Text style={styles.cardTitle}>속도</Text>
          </View>
          <View style={styles.metricRow}>
            <Metric label="평균속력" value={avg.toFixed(1)} unit="km/h" big />
            <Metric label="최고속력" value={max.toFixed(1)} unit="km/h" color={ORANGE} big />
          </View>
          <View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.round(avgRatio * 100)}%` }]} />
            </View>
            <Text style={styles.barCaption}>
              {max > 0
                ? `평균속력은 최고속력의 ${Math.round(avgRatio * 100)}% 수준이에요`
                : '이번 라이딩에서는 이동이 기록되지 않았어요'}
            </Text>
          </View>
          <Text style={styles.chartTitle}>시간별 속도 (km/h)</Text>
          <MiniLineChart
            values={speedSeries}
            color={ORANGE}
            minSpan={10}
            floor={0}
            startLabel="0:00"
            endLabel={endClock}
          />
        </View>

        {/* 고도 */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="trending-up-outline" size={16} color={SKY} />
            <Text style={styles.cardTitle}>고도</Text>
          </View>
          <View style={styles.metricRow}>
            <Metric label="종료 고도" value={meters(stats.altitude)} unit="m" big />
            <Metric label="상승 고도" value={`+${Math.round(stats.elevationGain)}`} unit="m" color={SKY} big />
          </View>
          <View style={styles.metricRow}>
            <Metric label="최고 고도" value={meters(stats.maxAltitude)} unit="m" />
            <Metric label="최저 고도" value={meters(stats.minAltitude)} unit="m" />
            <Metric
              label="고도차"
              value={
                stats.maxAltitude != null && stats.minAltitude != null
                  ? `${Math.round(stats.maxAltitude - stats.minAltitude)}`
                  : '—'
              }
              unit="m"
            />
          </View>
          {altSeries.length >= 2 ? (
            <>
              <Text style={styles.chartTitle}>시간별 고도 (m)</Text>
              <MiniLineChart
                values={altSeries}
                color={SKY}
                minSpan={10}
                startLabel="0:00"
                endLabel={endClock}
              />
            </>
          ) : (
            stats.altitude == null && (
              <Text style={styles.muted}>GPS 신호가 약해 고도를 측정하지 못했어요</Text>
            )
          )}
        </View>

        <Pressable
          style={({ pressed }) => [styles.doneButton, pressed && { opacity: 0.8 }]}
          onPress={close}
        >
          <Text style={styles.doneLabel}>확인</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 16,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: '#BDBDBD',
    fontSize: 13,
    marginTop: 4,
  },
  hero: {
    paddingVertical: 4,
    gap: 2,
  },
  heroLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  heroValue: {
    color: ORANGE,
    fontSize: 52,
    fontWeight: '800',
  },
  heroUnit: {
    fontSize: 22,
    fontWeight: '700',
  },
  heroRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  card: {
    backgroundColor: '#0D0D0D',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  map: {
    height: 220,
    borderRadius: 10,
  },
  mapBadge: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  mapBadgeText: {
    color: '#DDDDDD',
    fontSize: 12,
    textAlign: 'center',
  },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dotStart: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: ORANGE,
  },
  dotEnd: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ORANGE,
  },
  locLabel: {
    color: '#BDBDBD',
    fontSize: 12,
  },
  locText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
  },
  metricRow: {
    flexDirection: 'row',
  },
  metric: {
    flex: 1,
    gap: 2,
  },
  metricLabel: {
    color: '#BDBDBD',
    fontSize: 12,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  metricBig: {
    fontSize: 30,
    fontWeight: '800',
  },
  metricUnit: {
    fontSize: 13,
    fontWeight: '600',
    color: '#BDBDBD',
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#262626',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: ORANGE,
  },
  barCaption: {
    color: '#9A9A9A',
    fontSize: 12,
    marginTop: 6,
  },
  chartTitle: {
    color: '#BDBDBD',
    fontSize: 12,
    marginBottom: -4,
  },
  muted: {
    color: '#9A9A9A',
    fontSize: 13,
  },
  doneButton: {
    alignSelf: 'stretch',
    marginTop: 6,
    height: 52,
    borderRadius: 14,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneLabel: {
    color: '#000000',
    fontSize: 17,
    fontWeight: '700',
  },
});
