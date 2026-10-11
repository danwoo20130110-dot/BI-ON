import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useProfile } from '@/hooks/use-profile';
import { buildRanking } from '@/lib/sample-ranking';

type Row = { rank: number; name: string; sub: string; km: number; me?: boolean };

const LIST_UNTIL = 50;
const AVATAR = require('../../assets/images/Frame 2080012756.png');

// 단상 이미지 원본 비율 (가로 / 세로) — 비율 그대로 그려야 찌그러지지 않음
const PODIUM_RATIO = { 1: 213 / 234, 2: 214 / 190, 3: 214 / 159 };
const SCREEN_PAD = 10;
const PODIUM_PAD = 28;
const PODIUM_GAP = 6;

const fmt = (km: number) => `${km.toLocaleString()}km²`;

export default function RankingScreen() {
  const [selectButtonIndex, setSelectButtonIndex] = useState(0);
  const isSchool = selectButtonIndex === 0;
  const { profile } = useProfile();
  const mySchool = profile.school.trim() || null;
  const { riders, schools } = buildRanking(profile.nickname, mySchool);

  // 학교 탭: 학교 기록(소속 라이더 합), 개인 탭: 라이더 기록 (학교 등록 여부와 무관)
  const rows: Row[] = isSchool
    ? schools.map((s, i) => ({ rank: i + 1, name: s.name, sub: `라이더 ${s.riders}명`, km: s.km, me: s.mine }))
    : riders.map((r, i) => ({ rank: i + 1, name: r.name, sub: '', km: r.km, me: r.me }));
  const [first, second, third] = rows;
  const list = rows.slice(3, LIST_UNTIL);
  const me = rows.find((r) => r.me);

  const { width: screenW } = useWindowDimensions();
  const colW = (screenW - SCREEN_PAD * 2 - PODIUM_PAD * 2 - PODIUM_GAP * 2) / 3;
  const blockSize = (rank: 1 | 2 | 3) => ({ width: colW, height: colW / PODIUM_RATIO[rank] });

  return (
    <View style={styles.Container}>
      <View style={styles.toggleContainer}>
        <Pressable style={selectButtonIndex == 0? styles.toggleActiveBtn : styles.toggleBtn} onPress={() => setSelectButtonIndex(0)}>
          <Text style={selectButtonIndex == 0? styles.toggleActiveText : styles.toggleText}>학교</Text>
        </Pressable>
        <Pressable style={selectButtonIndex == 1? styles.toggleActiveBtn : styles.toggleBtn} onPress={() => setSelectButtonIndex(1)}>
          <Text style={selectButtonIndex == 1? styles.toggleActiveText : styles.toggleText}>개인</Text>
        </Pressable>
      </View>

      <View style={styles.podium}>
        <View style={styles.podiumCol}>
          <Image source={AVATAR} style={styles.image2} />
          <Text style={styles.name} numberOfLines={1}>{second.name}</Text>
          <Text style={styles.km2}>{fmt(second.km)}</Text>
          <Image source={require('../../assets/images/podium_2.png')} style={[styles.block, blockSize(2)]} />
        </View>

        <View style={styles.podiumCol}>
          <Image source={require('../../assets/images/trophy.png')} style={styles.trophy} />
          <Image source={AVATAR} style={styles.image1} />
          <Text style={styles.name} numberOfLines={1}>{first.name}</Text>
          <Text style={styles.km2}>{fmt(first.km)}</Text>
          <Image source={require('../../assets/images/podium_1.png')} style={[styles.block, blockSize(1)]} />
        </View>

        <View style={styles.podiumCol}>
          <Image source={AVATAR} style={styles.image2} />
          <Text style={styles.name} numberOfLines={1}>{third.name}</Text>
          <Text style={styles.km2}>{fmt(third.km)}</Text>
          <Image source={require('../../assets/images/podium_3.png')} style={[styles.block, blockSize(3)]} />
        </View>
      </View>

      <Text style={styles.caption}>
        {isSchool ? '학교 기록 = 그 학교 라이더 모두의 기록 합계' : '라이더 개인 기록'} · 예시 데이터 (가상)
      </Text>

      <ScrollView style={styles.listScroll} contentContainerStyle={styles.list}>
        {list.map((entry) => (
          <View key={entry.rank} style={[styles.rank2, entry.me && styles.myInlineRow]}>
            <Text style={[styles.num, entry.me && styles.myInlineText]}>{entry.rank}</Text>
            <Image source={AVATAR} style={styles.image} />
            <View style={styles.nameCol}>
              <Text style={[styles.pad, entry.me && styles.myInlineText]} numberOfLines={1}>
                {entry.name}
                {entry.me ? ' (나)' : ''}
              </Text>
              {!!entry.sub && <Text style={styles.sub} numberOfLines={1}>{entry.sub}</Text>}
            </View>
            <Text style={[styles.km, entry.me && styles.myInlineText]}>{fmt(entry.km)}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.myArea}>
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{isSchool ? '우리 학교 순위' : '내 순위'}</Text>
          <View style={styles.dividerLine} />
        </View>

        {me ? (
          <View style={[styles.rank2, styles.myRow]}>
            <Text style={[styles.num, styles.myText]}>{me.rank}</Text>
            <Image source={AVATAR} style={[styles.image, styles.myImage]} />
            <View style={styles.nameCol}>
              <Text style={[styles.pad, styles.myText]} numberOfLines={1}>{me.name}</Text>
              {!!me.sub && <Text style={styles.mySub} numberOfLines={1}>{me.sub}</Text>}
            </View>
            <Text style={styles.myKm}>{fmt(me.km)}</Text>
          </View>
        ) : (
          // 학교를 등록하지 않으면 우리 학교 기록은 보이지 않음
          <Pressable style={styles.registerCard} onPress={() => router.push('/profile-settings')}>
            <Ionicons name="school-outline" size={22} color="#FFA51F" />
            <View style={styles.nameCol}>
              <Text style={styles.registerTitle}>학교를 등록하면 우리 학교 기록을 볼 수 있어요</Text>
              <Text style={styles.registerSub}>프로필 설정에서 학교 선택</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8A8A8A" />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  Container: {
    flex: 1,
    backgroundColor: 'black',
    paddingTop: 48,
    paddingHorizontal: SCREEN_PAD,
    paddingBottom: 16,
  },

  toggleContainer: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: 'white',
    borderRadius: 200,
    padding: 3,
  },

  toggleBtn: {
    paddingVertical: 5,
    paddingHorizontal: 14,
  },
  toggleActiveBtn: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    backgroundColor: 'white',
    borderRadius: 100,
  },
  switchText: {
    color:'black'
  },
  toggleText: {
    fontSize: 13,
    color: 'white',
  },
  toggleActiveText: {
    fontSize: 13,
    color: 'black',
  },

  podium: {
    marginTop: 4,
    paddingHorizontal: PODIUM_PAD,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: PODIUM_GAP,
  },

  podiumCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },

  trophy: {
    width: 28,
    height: 28,
    resizeMode: 'contain',
  },

  image1: {
    width: 62,
    height: 62,
    borderRadius: 200,
  },

  image2: {
    width: 44,
    height: 44,
    borderRadius: 200,
  },

  name: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: 'bold',
    color: 'white',
  },

  km2: {
    fontSize: 11,
    color: '#E23B3B',
  },

  block: {
    marginTop: 4,
    resizeMode: 'stretch',
  },

  listScroll: {
    flex: 1,
    marginTop: 6,
  },

  list: {
    gap: 6,
    paddingBottom: 8,
  },

  myArea: {
    gap: 10,
    paddingTop: 8,
  },

  rank2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
  },

  num: {
    width: 34,
    fontSize: 15,
    color: 'white',
    textAlign: 'center',
  },

  image: {
    width: 32,
    height: 32,
    borderRadius: 200,
  },

  pad: {
    flexShrink: 1,
    padding: 2,
    fontSize: 15,
    color: 'white',
  },

  km: {
    marginLeft: 'auto',
    fontSize: 16,
    fontWeight: 'bold',
    color: '#E8912D',
  },

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#555555',
  },

  dividerText: {
    fontSize: 12,
    color: '#9A9A9A',
  },

  caption: {
    color: '#6A6A6A',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },

  nameCol: {
    flex: 1,
    minWidth: 0,
  },

  sub: {
    color: '#8A8A8A',
    fontSize: 11,
    paddingHorizontal: 2,
  },

  mySub: {
    color: 'rgba(0,0,0,0.65)',
    fontSize: 11,
    paddingHorizontal: 2,
  },

  registerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFA51F',
    backgroundColor: 'rgba(255,165,31,0.08)',
  },

  registerTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  registerSub: {
    color: '#BDBDBD',
    fontSize: 12,
    marginTop: 2,
  },

  myInlineRow: {
    backgroundColor: 'rgba(232,145,45,0.18)',
    borderRadius: 10,
  },

  myInlineText: {
    color: '#FFA51F',
    fontWeight: 'bold',
  },

  myRow: {
    backgroundColor: '#E8912D',
    borderRadius: 16,
    paddingVertical: 8,
    paddingRight: 14,
  },

  myText: {
    color: 'black',
    fontWeight: 'bold',
  },

  myImage: {
    borderWidth: 2,
    borderColor: 'white',
  },

  myKm: {
    marginLeft: 'auto',
    fontSize: 18,
    fontWeight: 'bold',
    color: 'black',
  },
});