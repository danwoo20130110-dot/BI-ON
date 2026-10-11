import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { DEFAULT_CENTER, MAP_BASE_URL } from '@/constants/kakao-map';
import { useProfile } from '@/hooks/use-profile';
import { ME_COLOR, TERRITORY_MAP_HTML } from '@/lib/territory-map-html';

// 모듈 상수로 두어 화면이 다시 그려져도 WebView 가 새로 로드되지 않게 함
const MAP_SOURCE = { html: TERRITORY_MAP_HTML, baseUrl: MAP_BASE_URL };
// 위치를 이 시간 안에 못 받으면 기본 위치(서울시청) 기준으로 시작
const LOCATION_WAIT_MS = 2500;

type Ranked = { name: string; color: string; me: boolean; area: number; count: number };
type SchoolRanked = {
  name: string;
  color: string;
  mine: boolean;
  area: number;
  riders: number;
  count: number;
  rank?: number;
};
type Stats = {
  top: Ranked[];
  myRank: number;
  myArea: number;
  myLoops: number;
  myLines: number;
  players: number;
  // 학교 기록 = 소속 라이더 땅의 합
  schoolTop: SchoolRanked[];
  mySchool: SchoolRanked | null;
  schoolCount: number;
};
type Mode = 'personal' | 'school';
type Capture = {
  who: string;
  where: string;
  km: number;
  area: number;
  loop: boolean;
  fromMe: boolean;
  school: string | null;
  mySchoolLost: boolean;
  mySchoolGained: boolean;
  // 이번에 없어진 남의 땅 수와 그 주인들
  erased: number;
  victims: string[];
};

function captureText(t: Capture, mode: Mode) {
  const how = t.loop ? `한 바퀴 돌아 ${t.area.toFixed(1)}km²를` : `${t.km.toFixed(1)}km 달려 땅을`;
  if (mode === 'school') {
    const who = t.school ? `${t.school} ${t.who}님` : `${t.who}님`;
    if (t.mySchoolGained) return `우리 학교 ${t.who}님이 ${t.where}에서 ${how} 차지했어요!`;
    if (t.mySchoolLost) return `${who}이 ${t.where}에서 우리 학교 땅을 뺏었어요!`;
    return `${who}이 ${t.where}에서 ${how} 차지했어요`;
  }
  if (t.fromMe) return `${t.who}님이 ${t.where}에서 ${how} 차지해서 내 땅이 없어졌어요!`;
  if (t.erased > 0) {
    const names = t.victims.join(', ') + (t.victims.length < t.erased ? ' 등' : '');
    return `${t.who}님이 ${t.where}에서 ${how} 차지 · ${names}님 땅 ${t.erased}곳 삭제`;
  }
  return `${t.who}님이 ${t.where}에서 ${how} 차지했어요`;
}

export default function TerritoryScreen() {
  const { profile, ready: profileReady } = useProfile();
  const webViewRef = useRef<WebView>(null);
  // 웹 전용: 지도 iframe 요소
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null);
  const startedRef = useRef(false);
  // 지도 페이지가 (다시) 로드될 때마다 증가 → 땅 생성/시뮬레이션을 다시 시작
  const [mapLoadCount, setMapLoadCount] = useState(0);
  const mapReady = mapLoadCount > 0;
  const [stats, setStats] = useState<Stats | null>(null);
  const [toast, setToast] = useState<Capture | null>(null);
  const [mode, setMode] = useState<Mode>('personal');
  const mySchool = profile.school.trim() || null;

  const runMap = useCallback(
    (js: string) => {
      if (Platform.OS === 'web') iframe?.contentWindow?.postMessage(`bion:${js}`, '*');
      else webViewRef.current?.injectJavaScript(`${js};true;`);
    },
    [iframe],
  );

  // 내 위치 기준으로 가상 땅을 한 번 만들고 시뮬레이션 시작
  const start = useCallback(
    (lat: number, lng: number) => {
      if (startedRef.current || !profileReady) return;
      startedRef.current = true;
      runMap(
        `window.bionStart(${lat}, ${lng}, ${JSON.stringify(profile.nickname)}, ${JSON.stringify(mySchool)})`,
      );
    },
    [runMap, profileReady, profile.nickname, mySchool],
  );

  const handleEvent = useCallback((type: string, payload: any) => {
    if (type === 'ready') {
      startedRef.current = false;
      setStats(null);
      setMapLoadCount((c) => c + 1);
    }
    else if (type === 'stats') setStats(payload);
    else if (type === 'capture') setToast(payload);
    else if (type === 'error') console.error('Territory map error:', payload);
  }, []);

  // 웹: iframe 에서 오는 메시지
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onMessage = (e: MessageEvent) => {
      if (!iframe || e.source !== iframe.contentWindow || typeof e.data !== 'string') return;
      try {
        const msg = JSON.parse(e.data);
        handleEvent(msg.type, msg.payload);
      } catch {}
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleEvent, iframe]);

  // 위치를 못 받으면 서울시청 기준으로 시작
  useEffect(() => {
    if (!mapReady) return;
    const t = setTimeout(
      () => start(DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude),
      LOCATION_WAIT_MS,
    );
    return () => clearTimeout(t);
  }, [mapReady, mapLoadCount, start]);

  // 내 위치: 처음 위치로 땅을 만들고, 이후엔 내 점만 따라 움직임
  useEffect(() => {
    if (!mapReady) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;
      const last = await Location.getLastKnownPositionAsync();
      if (last) {
        start(last.coords.latitude, last.coords.longitude);
        runMap(`window.bionSetMe(${last.coords.latitude}, ${last.coords.longitude})`);
      }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 10 },
        ({ coords }) => {
          start(coords.latitude, coords.longitude);
          runMap(`window.bionSetMe(${coords.latitude}, ${coords.longitude})`);
        },
      );
      if (cancelled) sub.remove();
    })().catch(() => {});
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [mapReady, mapLoadCount, runMap, start]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // 보기 전환 (지도가 다시 로드돼도 현재 보기 유지)
  useEffect(() => {
    if (mapReady) runMap(`window.bionSetMode(${JSON.stringify(mode)})`);
  }, [mapReady, mapLoadCount, mode, runMap]);

  const myInTop = stats?.top.some((r) => r.me);
  const mySchoolInTop = stats?.schoolTop?.some((r) => r.mine);
  const toastAlert = !!toast && (mode === 'school' ? toast.mySchoolLost : toast.fromMe);

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' ? (
        createElement('iframe', {
          ref: setIframe,
          srcDoc: TERRITORY_MAP_HTML,
          style: { border: 0, width: '100%', height: '100%', position: 'absolute', inset: 0 },
        })
      ) : (
        <WebView
          ref={webViewRef}
          source={MAP_SOURCE}
          originWhitelist={['*']}
          style={[StyleSheet.absoluteFill, { backgroundColor: '#111' }]}
          javaScriptEnabled
          onMessage={(e) => {
            try {
              const msg = JSON.parse(e.nativeEvent.data);
              handleEvent(msg.type, msg.payload);
            } catch {}
          }}
        />
      )}

      <SafeAreaView style={styles.topBar} edges={['top']} pointerEvents="box-none">
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>땅따먹기</Text>
            <Text style={styles.subText}>
              {mode === 'school'
                ? `학교 ${stats?.schoolCount ?? '—'}곳`
                : `수도권 라이더 ${stats?.players ?? '—'}명`}{' '}
              · 예시 데이터 (가상)
            </Text>
          </View>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>실시간</Text>
          </View>
        </View>
        <View style={styles.modeToggle}>
          {(['personal', 'school'] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
            >
              <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
                {m === 'personal' ? '개인' : '학교'}
              </Text>
            </Pressable>
          ))}
        </View>
        {toast && (
          <View style={[styles.toast, toastAlert && styles.toastAlert]}>
            <Ionicons
              name={toastAlert ? 'alert-circle' : 'flag'}
              size={14}
              color={toastAlert ? '#FF5A5F' : ME_COLOR}
            />
            <Text style={styles.toastText} numberOfLines={2}>
              {captureText(toast, mode)}
            </Text>
          </View>
        )}
      </SafeAreaView>

      <View style={styles.panel} pointerEvents="box-none">
        {mode === 'school' ? (
          <>
            {stats?.mySchool ? (
              <View style={styles.myRow}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={styles.label} numberOfLines={1}>
                    우리 학교 · {stats.mySchool.name}
                  </Text>
                  <Text style={styles.myValue}>
                    {stats.mySchool.area.toFixed(2)}
                    <Text style={styles.myUnit}> km²</Text>
                  </Text>
                </View>
                <View style={styles.myMeta}>
                  <Text style={styles.myRank}>{stats.mySchool.rank}위</Text>
                  <Text style={styles.cellCount}>라이더 {stats.mySchool.riders}명의 땅 합계</Text>
                </View>
              </View>
            ) : (
              // 학교를 등록해야 우리 학교 땅이 보임 (다른 학교 땅은 누구나 볼 수 있음)
              <Pressable style={styles.registerCard} onPress={() => router.push('/profile-settings')}>
                <Ionicons name="school-outline" size={20} color={ME_COLOR} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.registerTitle}>학교를 등록하면 우리 학교 땅을 볼 수 있어요</Text>
                  <Text style={styles.registerSub}>프로필 설정에서 학교 선택</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#8A8A8A" />
              </Pressable>
            )}

            <Text style={styles.label}>학교 순위 (소속 라이더 땅 합계)</Text>
            {stats?.schoolTop?.map((r, i) => (
              <View key={r.name} style={styles.leaderRow}>
                <Text style={styles.leaderRank}>{i + 1}</Text>
                <View style={[styles.swatch, { backgroundColor: r.color }]} />
                <Text style={[styles.leaderName, r.mine && styles.meText]} numberOfLines={1}>
                  {r.name}
                  {r.mine ? ' (우리 학교)' : ''}
                  <Text style={styles.riders}> · {r.riders}명</Text>
                </Text>
                <Text style={styles.leaderKm}>{r.area.toFixed(1)}km²</Text>
              </View>
            ))}
            {stats?.mySchool && !mySchoolInTop && (
              <View style={[styles.leaderRow, styles.myLeaderRow]}>
                <Text style={styles.leaderRank}>{stats.mySchool.rank}</Text>
                <View style={[styles.swatch, { backgroundColor: ME_COLOR }]} />
                <Text style={[styles.leaderName, styles.meText]} numberOfLines={1}>
                  {stats.mySchool.name} (우리 학교)
                </Text>
                <Text style={styles.leaderKm}>{stats.mySchool.area.toFixed(1)}km²</Text>
              </View>
            )}
          </>
        ) : (
          <>
            <View style={styles.myRow}>
              <View>
                <Text style={styles.label}>내 땅</Text>
                <Text style={styles.myValue}>
                  {stats ? stats.myArea.toFixed(2) : '—'}
                  <Text style={styles.myUnit}> km²</Text>
                </Text>
              </View>
              <View style={styles.myMeta}>
                <Text style={styles.myRank}>{stats ? `${stats.myRank}위` : '—'}</Text>
                <Text style={styles.cellCount}>
                  {stats ? `한 바퀴 ${stats.myLoops ?? 0} · 직선 ${stats.myLines ?? 0}` : ''}
                </Text>
              </View>
            </View>

            <Text style={styles.label}>수도권 순위</Text>
            {stats?.top.map((r, i) => (
              <View key={r.name} style={styles.leaderRow}>
                <Text style={styles.leaderRank}>{i + 1}</Text>
                <View style={[styles.swatch, { backgroundColor: r.color }]} />
                <Text style={[styles.leaderName, r.me && styles.meText]} numberOfLines={1}>
                  {r.name}
                  {r.me ? ' (나)' : ''}
                </Text>
                <Text style={styles.leaderKm}>{r.area.toFixed(1)}km²</Text>
              </View>
            ))}
            {stats && !myInTop && (
              <View style={[styles.leaderRow, styles.myLeaderRow]}>
                <Text style={styles.leaderRank}>{stats.myRank}</Text>
                <View style={[styles.swatch, { backgroundColor: ME_COLOR }]} />
                <Text style={[styles.leaderName, styles.meText]} numberOfLines={1}>
                  {profile.nickname} (나)
                </Text>
                <Text style={styles.leaderKm}>{stats.myArea.toFixed(1)}km²</Text>
              </View>
            )}
          </>
        )}
        <Text style={styles.credit}>
          한 바퀴 돌면 안쪽 전체, 쭉 달리면 길 폭 100m가 내 땅 · 누르면 주인이 보여요 · 길
          데이터 © OpenStreetMap 기여자
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    gap: 8,
  },
  modeToggle: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    padding: 3,
    borderRadius: 100,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1,
    borderColor: '#3A3A3A',
  },
  modeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 100,
  },
  modeBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  modeText: {
    color: '#DDDDDD',
    fontSize: 13,
    fontWeight: '600',
  },
  modeTextActive: {
    color: '#000000',
  },
  registerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ME_COLOR,
    backgroundColor: 'rgba(255,165,31,0.08)',
  },
  registerTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  registerSub: {
    color: '#BDBDBD',
    fontSize: 11,
    marginTop: 2,
  },
  riders: {
    color: '#8A8A8A',
    fontSize: 11,
    fontWeight: '400',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 6,
  },
  subText: {
    color: '#DDDDDD',
    fontSize: 11,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 4,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  liveText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  toast: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  toastAlert: {
    borderWidth: 1,
    borderColor: '#FF5A5F',
  },
  toastText: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontSize: 12,
  },
  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    padding: 14,
    gap: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    backgroundColor: 'rgba(10,10,10,0.92)',
  },
  myRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3A3A3A',
  },
  label: {
    color: '#BDBDBD',
    fontSize: 12,
  },
  myValue: {
    color: ME_COLOR,
    fontSize: 28,
    fontWeight: '800',
  },
  myUnit: {
    fontSize: 14,
    fontWeight: '700',
  },
  myMeta: {
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  myRank: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  cellCount: {
    color: '#BDBDBD',
    fontSize: 12,
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  myLeaderRow: {
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#3A3A3A',
  },
  leaderRank: {
    width: 22,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  leaderName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
  },
  meText: {
    color: ME_COLOR,
    fontWeight: '700',
  },
  leaderKm: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  credit: {
    color: '#6A6A6A',
    fontSize: 10,
    marginTop: 2,
  },
});
