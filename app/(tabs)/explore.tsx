import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileAvatar } from '@/components/profile-avatar';
import { useProfile } from '@/hooks/use-profile';

const RIDES = [
  { date: '2024.10.12', route: '서울 → 양평', distance: '45.2 km²', time: '2h 15m' },
  { date: '2024.10.08', route: '한강 일주', distance: '32.1 km²', time: '1h 50m' },
  { date: '2024.10.01', route: '도봉산 정복', distance: '28.5 km²', time: '2h 05m' },
];

// 0 ~ 1 사이 값 (위로 갈수록 큼)
const TREND = [0.75, 0.52, 0.7, 0.18, 0.3, 0.05, 1];

// 디자인 기준(iPhone 16, 393pt) 대비 화면 폭 비율로 크기 조정
const scale = Dimensions.get('window').width / 393;
const rs = (n: number) => Math.round(n * scale);

const CHART_HEIGHT = rs(70);
const CHART_INSET = rs(5);
const GRID_COLS = 7;
const GRID_ROWS = 3;
const LINE_W = rs(3);
const DOT = rs(8);

function TrendChart() {
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
            <Text style={styles.cardCaption}>예시 데이터 (가상)</Text>
          </View>
          <View style={styles.rideList}>
            {RIDES.map((ride) => (
              <View key={ride.date} style={styles.rideItem}>
                <View>
                  <Text style={styles.rideMain}>{ride.date}</Text>
                  <Text style={styles.rideSub}>{ride.route}</Text>
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
            <Text style={styles.cardTitle}>최근 라이딩 추이</Text>
            <Text style={styles.cardCaption}>예시 데이터 (가상)</Text>
          </View>
          <TrendChart />
        </View>

        <Pressable style={styles.logout} onPress={() => router.replace('/login')}>
          <Text style={styles.logoutText}>로그아웃</Text>
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
  cardCaption: {
    color: '#BDBDBD',
    fontSize: rs(11),
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
