import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { ProfileAvatar } from '@/components/profile-avatar';
import { fetchRideTotals, useMyRides, type MyRide, type RideTotals } from '@/hooks/my-rides-store';
import { useProfile } from '@/hooks/use-profile';
import { supabase } from '@/lib/supabase';

type RideRow = { key: string; date: string; sub: string; distance: string; time: string };

const pad2 = (n: number) => String(n).padStart(2, '0');

function toRow(r: MyRide): RideRow {
  const st = r.stat!;
  const d = new Date(st.at);
  const h = Math.floor(st.sec / 3600);
  const m = Math.floor((st.sec % 3600) / 60);
  const per = st.km > 0.01 ? Math.round(st.sec / st.km) : 0;
  return {
    key: String(r.at),
    date: `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
    sub: `평균 ${st.avg.toFixed(1)}km/h · 1km ${Math.floor(per / 60)}'${pad2(per % 60)}"`,
    distance: `${st.km.toFixed(2)} km`,
    time: h > 0 ? `${h}h ${pad2(m)}m` : `${m}m ${pad2(st.sec % 60)}s`,
  };
}

// 최근 7일 하루별 거리 (0~1 로 맞춤)
function weekTrend(rides: MyRide[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const from = today.getTime() - (6 - i) * 86400000;
    return rides
      .filter((r) => r.stat && r.stat.at >= from && r.stat.at < from + 86400000)
      .reduce((a, r) => a + (r.stat?.km ?? 0), 0);
  });
  const max = Math.max(...days);
  return max > 0 ? days.map((v) => v / max) : days;
}

const scale = Dimensions.get('window').width / 393;
const rs = (n: number) => Math.round(n * scale);

const CHART_HEIGHT = rs(70);
const CHART_INSET = rs(5);
const GRID_COLS = 7;
const GRID_ROWS = 3;
const LINE_W = rs(3);
const DOT = rs(8);

function TrendChart({ values: TREND }: { values: number[] }) {
  const [width, setWidth] = useState(0);

  const points = TREND.map((v, i) => ({
    x: CHART_INSET + ((width - CHART_INSET * 2) / (TREND.length - 1)) * i,
    y: CHART_INSET + (1 - v) * (CHART_HEIGHT - CHART_INSET * 2),
  }));

  return (
    <View style={styles.chart} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {Array.from({ length: GRID_COLS - 1 }).map((_, i) => (
        <View
          key={`c${i}`}
          style={[styles.gridV, { left: (width / GRID_COLS) * (i + 1) }]}
        />
      ))}
      {Array.from({ length: GRID_ROWS - 1 }).map((_, i) => (
        <View
          key={`r${i}`}
          style={[styles.gridH, { top: (CHART_HEIGHT / GRID_ROWS) * (i + 1) }]}
        />
      ))}

      {width > 0 &&
        points.slice(1).map((p, i) => {
          const prev = points[i];
          const dx = p.x - prev.x;
          const dy = p.y - prev.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx);
          return (
            <View
              key={`l${i}`}
              style={[
                styles.line,
                {
                  width: length,
                  left: (prev.x + p.x) / 2 - length / 2,
                  top: (prev.y + p.y) / 2 - LINE_W / 2,
                  transform: [{ rotate: `${angle}rad` }],
                },
              ]}
            />
          );
        })}

      {width > 0 &&
        points.map((p, i) => (
          <View key={`d${i}`} style={[styles.dot, { left: p.x - DOT / 2, top: p.y - DOT / 2 }]} />
        ))}
    </View>
  );
}

export default function ProfileScreen() {
  const { profile } = useProfile();
  const myRides = useMyRides().filter((r) => r.stat);
  const hasRides = myRides.length > 0;
  const rows = myRides.slice(-3).reverse().map(toRow);
  const trend = weekTrend(myRides);
  // 합계는 서버에서 전체 기록으로 셈 (폰에는 최근 기록만 있음)
  const [totals, setTotals] = useState<RideTotals | null>(null);
  useFocusEffect(
    useCallback(() => {
      fetchRideTotals().then((t) => t && setTotals(t));
    }, []),
  );
  const rideCount = totals?.count ?? myRides.length;
  const totalKm = totals?.km ?? myRides.reduce((a, r) => a + (r.stat?.km ?? 0), 0);
  const bestSpeed = totals?.maxKmh ?? myRides.reduce((a, r) => Math.max(a, r.stat?.max ?? 0), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.name} numberOfLines={1}>
              {profile.nickname}
            </Text>
            {!!profile.school && (
              <View style={styles.schoolRow}>
                <Ionicons name="school-outline" size={rs(13)} color="#BDBDBD" />
                <Text style={styles.schoolText}>
                  {profile.school}
                  {profile.grade ? ` · ${profile.grade}` : ''}
                </Text>
              </View>
            )}
            {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}
            <Pressable
              style={styles.settingRow}
              onPress={() => router.push('/profile-settings')}
              hitSlop={8}
            >
              <Text style={styles.settingText}>프로필 설정</Text>
              <Ionicons name="chevron-forward" size={rs(15)} color="#FFFFFF" />
            </Pressable>
          </View>
          <Pressable onPress={() => router.push('/profile-settings')}>
            <ProfileAvatar nickname={profile.nickname} photoUri={profile.photoUri} size={rs(80)} />
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>최근 라이딩 기록</Text>
            {hasRides && (
              <Pressable style={styles.moreRow} onPress={() => router.push('/rides')} hitSlop={8}>
                <Text style={styles.moreText}>전체 보기</Text>
                <Ionicons name="chevron-forward" size={rs(14)} color="#BDBDBD" />
              </Pressable>
            )}
          </View>
          {hasRides && (
            <View style={styles.totals}>
              <View style={styles.total}>
                <Text style={styles.totalValue}>{rideCount}회</Text>
                <Text style={styles.totalLabel}>라이딩</Text>
              </View>
              <View style={styles.total}>
                <Text style={styles.totalValue}>{totalKm.toFixed(1)}km</Text>
                <Text style={styles.totalLabel}>총 거리</Text>
              </View>
              <View style={styles.total}>
                <Text style={styles.totalValue}>{bestSpeed.toFixed(1)}km/h</Text>
                <Text style={styles.totalLabel}>최고속력</Text>
              </View>
            </View>
          )}
          <View style={styles.rideList}>
            {!hasRides && <Text style={styles.rideSub}>아직 라이딩 기록이 없어요. 첫 라이딩을 시작해 보세요!</Text>}
            {rows.map((ride) => (
              <View key={ride.key} style={styles.rideItem}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={styles.rideMain}>{ride.date}</Text>
                  <Text style={styles.rideSub}>{ride.sub}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.rideMain}>{ride.distance}</Text>
                  <Text style={styles.rideSub}>{ride.time}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>최근 7일 라이딩</Text>
          </View>
          <TrendChart values={trend} />
        </View>

        <Pressable style={styles.logout} onPress={() => supabase.auth.signOut()}>
          <Text style={styles.logoutText}>로그아웃</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  totals: {
    flexDirection: 'row',
    paddingVertical: rs(6),
  },
  total: {
    flex: 1,
    alignItems: 'center',
    gap: rs(2),
  },
  totalValue: {
    color: '#FFA51F',
    fontSize: rs(16),
    fontWeight: '700',
  },
  totalLabel: {
    color: '#9A9A9A',
    fontSize: rs(11),
  },
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: rs(18),
    paddingTop: rs(24),
    paddingBottom: rs(28),
    gap: rs(12),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rs(32),
  },
  name: {
    color: '#FFFFFF',
    fontSize: rs(32),
    fontWeight: '700',
  },
  headerText: {
    flex: 1,
    marginRight: rs(16),
    gap: rs(4),
  },
  schoolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(4),
  },
  schoolText: {
    color: '#BDBDBD',
    fontSize: rs(13),
  },
  bio: {
    color: '#DDDDDD',
    fontSize: rs(13),
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: rs(4),
    gap: rs(2),
  },
  settingText: {
    color: '#FFFFFF',
    fontSize: rs(14),
  },
  card: {
    backgroundColor: '#0D0D0D',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: rs(16),
    padding: rs(14),
    gap: rs(12),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: rs(17),
    fontWeight: '700',
  },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(2),
  },
  moreText: {
    color: '#BDBDBD',
    fontSize: rs(13),
  },
  rideList: {
    gap: rs(10),
  },
  rideItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: rs(10),
    paddingHorizontal: rs(12),
    paddingVertical: rs(9),
  },
  rideMain: {
    color: '#FFFFFF',
    fontSize: rs(15),
    fontWeight: '700',
  },
  rideSub: {
    color: '#BDBDBD',
    fontSize: rs(12),
    marginTop: rs(2),
  },
  chart: {
    height: CHART_HEIGHT,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: rs(8),
    overflow: 'hidden',
  },
  gridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#3A2A10',
  },
  gridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#3A2A10',
  },
  line: {
    position: 'absolute',
    height: LINE_W,
    borderRadius: LINE_W / 2,
    backgroundColor: '#B8740E',
  },
  dot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: '#FFD43B',
  },
  logout: {
    alignSelf: 'center',
    marginTop: 'auto',
    paddingTop: rs(40),
    padding: rs(8),
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: rs(13),
  },
});
