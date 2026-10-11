import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { type ComponentProps, useEffect, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useProfile } from '@/hooks/use-profile';
import { buildRanking } from '@/lib/sample-ranking';

const ORANGE = '#FFA51F';
// 지도 위 글씨가 잘 보이도록 위·아래를 단계적으로 어둡게
const steps = (from: number, to: number, n: number) =>
  Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
const TOP_FADE = [...steps(0.92, 0.92, 8), ...steps(0.9, 0, 12)];
const BOTTOM_FADE = steps(0, 0.85, 14);
// 예시 데이터 (가상)
const WEEK_KM = 24.6;

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '새벽 라이딩도 좋아요';
  if (h < 12) return '좋은 아침이에요';
  if (h < 18) return '오늘도 달려볼까요';
  return '저녁 라이딩 어때요';
}

// 시작 버튼 뒤에서 은은하게 퍼지는 원
function usePulse() {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return {
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
    transform: [{ scaleX: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) },
      { scaleY: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
  };
}

type Card = {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  unit: string;
  onPress: () => void;
};

type Props = { onStart: () => void; permissionDenied: boolean };

// 홈(라이딩 전) 화면: 인사 + 요약 카드 + 시작 버튼
export function HomeIdle({ onStart, permissionDenied }: Props) {
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const school = profile.school.trim() || null;
  const { riders, schools } = buildRanking(profile.nickname, school);
  const myRank = riders.findIndex((r) => r.me) + 1;
  const schoolRank = school ? schools.findIndex((s) => s.mine) + 1 : 0;
  const pulse = usePulse();

  const cards: Card[] = [
    { icon: 'bicycle', label: '이번 주', value: `${WEEK_KM}`, unit: 'km', onPress: () => router.push('/explore') },
    { icon: 'trophy', label: '개인 랭킹', value: `${myRank}`, unit: '위', onPress: () => router.push('/ranking') },
    school
      ? { icon: 'school', label: '우리 학교', value: `${schoolRank}`, unit: '위', onPress: () => router.push('/ranking') }
      : { icon: 'school', label: '학교 등록', value: '+', unit: '', onPress: () => router.push('/profile-settings') },
  ];

  return (
    <>
      <View style={styles.top} pointerEvents="box-none">
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {TOP_FADE.map((o, i) => (
            <View key={i} style={[styles.band, { opacity: o }]} />
          ))}
        </View>

        <View style={[styles.topContent, { paddingTop: insets.top + 12 }]} pointerEvents="box-none">
          <View style={styles.headerRow} pointerEvents="box-none">
            <Image source={require('@/assets/images/BION.png')} style={styles.logo} resizeMode="contain" />
            <View style={styles.weather}>
              <Ionicons name="partly-sunny" size={14} color={ORANGE} />
              <Text style={styles.weatherText}>라이딩 하기 좋은 날</Text>
            </View>
          </View>

          <Text style={styles.hello}>
            {greeting()}, <Text style={styles.name}>{profile.nickname}</Text>님
          </Text>
          {school && <Text style={styles.school}>{school}{profile.grade ? ` · ${profile.grade}` : ''}</Text>}

          <View style={styles.cards} pointerEvents="box-none">
            {cards.map((c) => (
              <Pressable key={c.label} style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]} onPress={c.onPress}>
                <View style={styles.cardHead}>
                  <Ionicons name={c.icon} size={13} color={ORANGE} />
                  <Text style={styles.cardLabel}>{c.label}</Text>
                </View>
                <Text style={styles.cardValue}>
                  {c.value}
                  <Text style={styles.cardUnit}>{c.unit}</Text>
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.sample}>예시 데이터 (가상)</Text>
        </View>
      </View>

      <View style={styles.bottom} pointerEvents="box-none">
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {BOTTOM_FADE.map((o, i) => (
            <View key={i} style={[styles.band, { opacity: o }]} />
          ))}
        </View>

        <Text style={styles.hint}>
          <Ionicons name="flag" size={12} color={ORANGE} /> 한 바퀴 돌아오면 안쪽이 전부 내 땅이 돼요
        </Text>

        <View style={styles.startWrap}>
          <Animated.View style={[styles.pulse, pulse]} pointerEvents="none" />
          <Pressable
            onPress={onStart}
            style={({ pressed }) => [styles.startButton, pressed && styles.startButtonPressed]}
            hitSlop={8}
          >
            <Image style={styles.bion} source={require('@/assets/images/BI_ON.png')} />
            <View style={styles.startRow}>
              <Text style={styles.startLabel}>
                {permissionDenied ? '위치 권한 필요 · 시작하기' : '라이딩 시작하기'}
              </Text>
              <Ionicons name="play" size={13} color={ORANGE} />
            </View>
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    elevation: 10,
  },
  band: {
    height: 16,
    backgroundColor: '#000',
  },
  topContent: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  logo: {
    width: 92,
    height: 24,
  },
  weather: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  weatherText: {
    color: '#DDDDDD',
    fontSize: 11,
    fontWeight: '600',
  },
  hello: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  name: {
    color: ORANGE,
  },
  school: {
    color: '#BDBDBD',
    fontSize: 12,
  },
  cards: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  card: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(20,20,20,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 4,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardLabel: {
    color: '#BDBDBD',
    fontSize: 11,
  },
  cardValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  cardUnit: {
    color: '#BDBDBD',
    fontSize: 12,
    fontWeight: '600',
  },
  sample: {
    color: '#9A9A9A',
    fontSize: 10,
    alignSelf: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 100,
    backgroundColor: 'rgba(0,0,0,0.7)',
    overflow: 'hidden',
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingBottom: 22,
    paddingTop: 40,
    zIndex: 10,
    elevation: 10,
  },
  hint: {
    color: '#DDDDDD',
    fontSize: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: 'rgba(0,0,0,0.75)',
    overflow: 'hidden',
  },
  startWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 200,
    borderWidth: 2,
    borderColor: ORANGE,
  },
  startButton: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 72,
    borderRadius: 200,
    borderWidth: 1.5,
    borderColor: ORANGE,
    backgroundColor: '#0A0A0A',
  },
  startButtonPressed: {
    backgroundColor: '#1F1404',
  },
  startRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  startLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  bion: {
    width: 100,
    height: 23,
  },
});
