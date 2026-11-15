import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

import { Text } from '@/components/ui/text';
import { ProfileAvatar } from '@/components/profile-avatar';
import { useRanking, type RankRow } from '@/hooks/use-ranking';
import { formatArea as fmt } from '@/lib/territory';

const PODIUM_RATIO = { 1: 213 / 234, 2: 214 / 190, 3: 214 / 159 };
const SCREEN_PAD = 10;
const PODIUM_PAD = 28;
const PODIUM_GAP = 6;

// 개인 순위에만 프로필 사진 (학교 순위는 사진 없이)
function Avatar({ row, size, style }: { row: RankRow; size: number; style?: object }) {
  return (
    <View style={style}>
      <ProfileAvatar nickname={row.name} photoUri={row.photoUri ?? null} size={size} />
    </View>
  );
}

export default function RankingScreen() {
  const [selectButtonIndex, setSelectButtonIndex] = useState(0);
  const isSchool = selectButtonIndex === 0;
  const ranking = useRanking(isSchool ? 'school' : 'personal');

  const sub = (r: RankRow) => (isSchool ? `라이더 ${r.riders ?? 0}명` : (r.school ?? ''));
  const rows = ranking?.rows ?? [];
  const me = ranking?.me ?? null;
  const isMe = (r: RankRow) => r.id === me?.id;
  const list = rows.slice(3);

  const { width: screenW } = useWindowDimensions();
  const colW = (screenW - SCREEN_PAD * 2 - PODIUM_PAD * 2 - PODIUM_GAP * 2) / 3;
  const blockSize = (rank: 1 | 2 | 3) => ({ width: colW, height: colW / PODIUM_RATIO[rank] });

  const podium = (place: 1 | 2 | 3) => {
    const r = rows[place - 1];
    const big = place === 1;
    return (
      <View style={styles.podiumCol}>
        {big && <Image source={require('../../assets/images/trophy.png')} style={styles.trophy} />}
        {!isSchool &&
          (r ? (
            <Avatar row={r} size={big ? 62 : 44} />
          ) : (
            <View style={[styles.emptySeat, big ? styles.image1 : styles.image2]} />
          ))}
        <Text style={[styles.name, r && isMe(r) && styles.myInlineText]} numberOfLines={1}>
          {r ? r.name : '—'}
        </Text>
        <Text style={styles.km2}>{r ? fmt(r.area) : ' '}</Text>
        <Image
          source={
            place === 1
              ? require('../../assets/images/podium_1.png')
              : place === 2
                ? require('../../assets/images/podium_2.png')
                : require('../../assets/images/podium_3.png')
          }
          style={[styles.block, blockSize(place)]}
        />
      </View>
    );
  };

  return (
    <View style={styles.Container}>
      <View style={styles.toggleContainer}>
        <Pressable style={isSchool ? styles.toggleActiveBtn : styles.toggleBtn} onPress={() => setSelectButtonIndex(0)}>
          <Text style={isSchool ? styles.toggleActiveText : styles.toggleText}>학교</Text>
        </Pressable>
        <Pressable style={!isSchool ? styles.toggleActiveBtn : styles.toggleBtn} onPress={() => setSelectButtonIndex(1)}>
          <Text style={!isSchool ? styles.toggleActiveText : styles.toggleText}>개인</Text>
        </Pressable>
      </View>

      <View style={styles.podium}>
        {podium(2)}
        {podium(1)}
        {podium(3)}
      </View>

      <ScrollView style={styles.listScroll} contentContainerStyle={styles.list}>
        {!ranking && <ActivityIndicator color="#8A8A8A" style={styles.empty} />}
        {ranking && rows.length === 0 && (
          <Text style={styles.emptyText}>
            {isSchool ? '아직 땅을 가진 학교가 없어요.' : '아직 땅을 가진 라이더가 없어요.'}
            {'\n'}라이딩으로 첫 땅을 차지해 보세요!
          </Text>
        )}
        {list.map((entry) => {
          const mine = isMe(entry);
          return (
            <View key={entry.id} style={[styles.rank2, mine && styles.myInlineRow]}>
              <Text style={[styles.num, mine && styles.myInlineText]}>{entry.rank}</Text>
              {!isSchool && <Avatar row={entry} size={32} />}
              <View style={styles.nameCol}>
                <Text style={[styles.pad, mine && styles.myInlineText]} numberOfLines={1}>
                  {entry.name}
                  {mine ? (isSchool ? ' (우리 학교)' : ' (나)') : ''}
                </Text>
                {!!sub(entry) && <Text style={styles.sub} numberOfLines={1}>{sub(entry)}</Text>}
              </View>
              <Text style={[styles.km, mine && styles.myInlineText]}>{fmt(entry.area)}</Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.myArea}>
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>
            {isSchool ? '우리 학교 순위' : '내 순위'}
            {ranking ? ` · 전체 ${ranking.total}${isSchool ? '곳' : '명'}` : ''}
          </Text>
          <View style={styles.dividerLine} />
        </View>

        {me ? (
          <View style={[styles.rank2, styles.myRow]}>
            <Text style={[styles.num, styles.myText]}>{me.rank}</Text>
            {!isSchool && <Avatar row={me} size={32} style={styles.myImage} />}
            <View style={styles.nameCol}>
              <Text style={[styles.pad, styles.myText]} numberOfLines={1}>{me.name}</Text>
              {!!sub(me) && <Text style={styles.mySub} numberOfLines={1}>{sub(me)}</Text>}
            </View>
            <Text style={styles.myKm}>{fmt(me.area)}</Text>
          </View>
        ) : ranking && isSchool ? (
          <Pressable style={styles.registerCard} onPress={() => router.push('/profile-settings')}>
            <Ionicons name="school-outline" size={22} color="#FFA51F" />
            <View style={styles.nameCol}>
              <Text style={styles.registerTitle}>학교를 등록하면 우리 학교 기록을 볼 수 있어요</Text>
              <Text style={styles.registerSub}>프로필 설정에서 학교 선택</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8A8A8A" />
          </Pressable>
        ) : null}
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
    borderRadius: 200,
  },

  emptySeat: {
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#333333',
  },

  empty: {
    marginTop: 24,
  },

  emptyText: {
    marginTop: 24,
    color: '#8A8A8A',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },

  myKm: {
    marginLeft: 'auto',
    fontSize: 18,
    fontWeight: 'bold',
    color: 'black',
  },
});