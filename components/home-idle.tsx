import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMyRides, weekKm } from '@/hooks/my-rides-store';
import { useProfile } from '@/hooks/use-profile';
import { useRanking } from '@/hooks/use-ranking';

const ORANGE = '#FFA51F';

type Props = { onStart: () => void; permissionDenied: boolean };

export function HomeIdle({ onStart, permissionDenied }: Props) {
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const myRides = useMyRides();
  const week = weekKm(myRides);
  const school = profile.school.trim() || null;
  const myRank = useRanking('personal')?.me?.rank;
  const schoolRank = useRanking('school')?.me?.rank;

  return (
    <>
      <View style={[styles.top, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
        <Image source={require('@/assets/images/BION.png')} style={styles.logo} resizeMode="contain" />

        <View style={styles.summary} pointerEvents="box-none">
          <Pressable style={styles.item} onPress={() => router.push('/explore')}>
            <Text style={styles.value}>{week.toFixed(1)}km</Text>
            <Text style={styles.label}>이번 주</Text>
          </Pressable>
          <View style={styles.sep} />
          <Pressable style={styles.item} onPress={() => router.push('/ranking')}>
            <Text style={styles.value}>{myRank ? `${myRank}위` : '-'}</Text>
            <Text style={styles.label}>개인</Text>
          </Pressable>
          <View style={styles.sep} />
          <Pressable
            style={styles.item}
            onPress={() => router.push(school ? '/ranking' : '/profile-settings')}
          >
            <Text style={styles.value}>{school && schoolRank ? `${schoolRank}위` : '-'}</Text>
            <Text style={styles.label}>{school ? '학교' : '학교 등록'}</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={onStart}
        style={({ pressed }) => [styles.startButton, pressed && styles.startButtonPressed]}
        hitSlop={8}
      >
        <Image style={styles.bion} source={require('@/assets/images/BI_ON.png')} />
        <Text style={styles.startLabel}>{permissionDenied ? '위치 권한 필요' : '시작하기'}</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 14,
    backgroundColor: 'rgba(0,0,0,0.75)',
    zIndex: 10,
    elevation: 10,
  },
  logo: {
    width: 90,
    height: 25,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#141414',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  sep: {
    width: 1,
    height: 28,
    backgroundColor: '#2A2A2A',
  },
  value: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  label: {
    color: '#9A9A9A',
    fontSize: 12,
  },
  startButton: {
    position: 'absolute',
    bottom: 27,
    alignSelf: 'center',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 80,
    borderRadius: 200,
    borderWidth: 1,
    borderColor: '#4C4C4C',
    backgroundColor: '#0A0A0A',
    zIndex: 10,
    elevation: 10,
  },
  startButtonPressed: {
    backgroundColor: '#1A1A1A',
    borderColor: ORANGE,
  },
  startLabel: {
    color: '#9A9A9A',
    fontSize: 14,
    fontWeight: '500',
  },
  bion: {
    width: 100,
    height: 23,
  },
});
