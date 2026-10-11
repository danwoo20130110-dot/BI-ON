import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, Image, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ORANGE = '#FFA51F';
// 위·아래로 갈수록 어두워지는 단계형 그라데이션 (사진 위 글씨가 잘 보이도록)
// 단계를 잘게 나눠 줄무늬가 보이지 않게 함
const steps = (from: number, to: number, n: number) =>
  Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
const TOP_FADE = steps(0.85, 0, 14);
const BOTTOM_FADE = steps(0, 0.92, 24);

const FEATURES = [
  { icon: 'navigate', label: '실시간 라이딩 기록' },
  { icon: 'flag', label: '땅따먹기' },
  { icon: 'trophy', label: '학교 랭킹' },
] as const;

// 아래에서 살짝 올라오며 나타나는 애니메이션
function useRise(delay: number) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 700,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [v, delay]);
  return {
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
  };
}

export default function LoginScreen() {
  const logo = useRise(100);
  const copy = useRise(350);
  const chips = useRise(600);
  const buttons = useRise(850);

  return (
    <ImageBackground
      source={require('../assets/images/bike-background-dark.png')}
      style={s.bg}
      resizeMode="cover"
    >
      <View style={s.fadeTop} pointerEvents="none">
        {TOP_FADE.map((o, i) => (
          <View key={i} style={[s.band, { opacity: o }]} />
        ))}
      </View>
      <View style={s.fadeBottom} pointerEvents="none">
        {BOTTOM_FADE.map((o, i) => (
          <View key={i} style={[s.band, { opacity: o }]} />
        ))}
        <View style={[s.band, s.bandSolid]} />
      </View>

      <SafeAreaView style={s.container}>
        <Animated.View style={[s.top, logo]}>
          <Image source={require('../assets/images/BION.png')} style={s.logo} resizeMode="contain" />
          <View style={s.season}>
            <View style={s.liveDot} />
            <Text style={s.seasonText}>2026 가을 시즌 진행 중</Text>
          </View>
        </Animated.View>

        <View style={{ flex: 1 }} />

        <Animated.View style={copy}>
          <Text style={s.headline}>
            달린 만큼{'\n'}
            <Text style={s.accent}>내 땅</Text>이 된다
          </Text>
          <Text style={s.sub}>한 바퀴 돌면 안쪽 전체가, 쭉 달리면 지나간 길이 내 땅.{'\n'}우리 학교와 함께 도시를 차지해 보세요.</Text>
        </Animated.View>

        <Animated.View style={[s.chips, chips]}>
          {FEATURES.map((f) => (
            <View key={f.label} style={s.chip}>
              <Ionicons name={f.icon} size={14} color={ORANGE} />
              <Text style={s.chipText}>{f.label}</Text>
            </View>
          ))}
        </Animated.View>

        <Animated.View style={[s.buttons, buttons]}>
          <Link href="/(tabs)" asChild>
            <Pressable style={s.login}>
              <Text style={s.loginText}>로그인하기</Text>
              <Ionicons name="arrow-forward" size={20} color="#000" />
            </Pressable>
          </Link>

          <Link href="/signup" asChild>
            <Pressable style={s.signup}>
              <Text style={s.signupText}>학교 선택하고 회원가입</Text>
            </Pressable>
          </Link>
        </Animated.View>
      </SafeAreaView>
    </ImageBackground>
  );
}

const s = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#000',
  },
  fadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  fadeBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  band: {
    height: 18,
    backgroundColor: '#000',
  },
  bandSolid: {
    height: 260,
    opacity: 0.92,
  },
  container: {
    flex: 1,
    paddingHorizontal: 22,
    paddingBottom: 12,
  },
  top: {
    alignItems: 'flex-start',
    paddingTop: 24,
    gap: 14,
  },
  logo: {
    width: 150,
    height: 36,
  },
  season: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ORANGE,
  },
  seasonText: {
    color: '#EEEEEE',
    fontSize: 12,
    fontWeight: '600',
  },
  headline: {
    color: '#FFFFFF',
    fontSize: 40,
    lineHeight: 50,
    fontWeight: '800',
    letterSpacing: -1,
  },
  accent: {
    color: ORANGE,
  },
  sub: {
    color: '#C8C8C8',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 20,
    marginBottom: 28,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: 'rgba(255,165,31,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,165,31,0.35)',
  },
  chipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  buttons: {
    gap: 12,
  },
  login: {
    flexDirection: 'row',
    gap: 8,
    height: 56,
    borderRadius: 18,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '800',
  },
  signup: {
    height: 56,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signupText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
