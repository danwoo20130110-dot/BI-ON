import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { WebView } from '@/lib/webview';
import { DEFAULT_CENTER, MAP_BASE_URL } from '@/constants/kakao-map';
import { LandCard, type LandInfo } from '@/components/land-card';
import { refreshMyRides } from '@/hooks/my-rides-store';
import { useAuth } from '@/hooks/use-auth';
import { useProfile } from '@/hooks/use-profile';
import {
  fetchLandAt,
  fetchLands,
  fetchStats,
  areaParts,
  formatArea,
  schoolKeyOf,
  type Bounds,
  type TerritoryStats,
} from '@/lib/territory';
import { ME_COLOR, TERRITORY_MAP_HTML } from '@/lib/territory-map-html';

const MAP_SOURCE = { html: TERRITORY_MAP_HTML, baseUrl: MAP_BASE_URL };
const LOCATION_WAIT_MS = 2500;
const BOUNDS_DELAY_MS = 250;

type Mode = 'personal' | 'school';
export default function TerritoryScreen() {
  const { userId } = useAuth();
  const { profile } = useProfile();
  const webViewRef = useRef<WebView>(null);
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null);
  const startedRef = useRef(false);
  const boundsRef = useRef<Bounds | null>(null);
  const boundsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapLoadCount, setMapLoadCount] = useState(0);
  const mapReady = mapLoadCount > 0;
  const [stats, setStats] = useState<TerritoryStats | null>(null);
  const [mode, setMode] = useState<Mode>('personal');
  const [expanded, setExpanded] = useState(false);
  const [land, setLand] = useState<LandInfo | null>(null);
  const mySchoolKey = schoolKeyOf(profile.school, profile.schoolRegion);

  const runMap = useCallback(
    (js: string) => {
      if (Platform.OS === 'web') iframe?.contentWindow?.postMessage(`bion:${js}`, '*');
      else webViewRef.current?.injectJavaScript(`${js};true;`);
    },
    [iframe],
  );

  // 지금 보이는 범위의 땅을 서버에서 받아 지도에 그림
  const loadLands = useCallback(async () => {
    const b = boundsRef.current;
    if (!b) return;
    const lands = await fetchLands(b, userId, mySchoolKey);
    if (lands) runMap(`window.bionSetLands(${JSON.stringify(lands)})`);
  }, [runMap, userId, mySchoolKey]);

  const loadStats = useCallback(async () => {
    const s = await fetchStats(userId);
    if (s) setStats(s);
  }, [userId]);

  // 화면에 들어올 때마다: 못 올린 라이딩을 올리고(서버가 땅 계산) 땅·순위를 새로 받음
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      refreshMyRides()
        .catch(() => {})
        .then(() => {
          if (!alive) return;
          loadLands();
          loadStats();
        });
      return () => {
        alive = false;
      };
    }, [loadLands, loadStats]),
  );

  const start = useCallback(
    (lat: number, lng: number) => {
      if (startedRef.current) return;
      startedRef.current = true;
      runMap(`window.bionStart(${lat}, ${lng})`);
    },
    [runMap],
  );

  const openLand = useCallback(
    async (tap: { owner: string; color: string; lat: number; lng: number } | null) => {
      if (!tap) {
        setLand(null);
        return;
      }
      const info = await fetchLandAt(tap.owner, tap.lat, tap.lng, tap.color, userId);
      setLand(info);
      if (!info) runMap('window.bionHideTap()');
    },
    [runMap, userId],
  );

  const handleEvent = useCallback(
    (type: string, payload: any) => {
      if (type === 'ready') {
        startedRef.current = false;
        boundsRef.current = null;
        setMapLoadCount((c) => c + 1);
      } else if (type === 'bounds') {
        boundsRef.current = payload;
        if (boundsTimer.current) clearTimeout(boundsTimer.current);
        boundsTimer.current = setTimeout(loadLands, BOUNDS_DELAY_MS);
      } else if (type === 'tap') openLand(payload);
      else if (type === 'error') console.error('Territory map error:', payload);
    },
    [loadLands, openLand],
  );

  useEffect(() => () => {
    if (boundsTimer.current) clearTimeout(boundsTimer.current);
  }, []);

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

  useEffect(() => {
    if (!mapReady) return;
    const t = setTimeout(
      () => start(DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude),
      LOCATION_WAIT_MS,
    );
    return () => clearTimeout(t);
  }, [mapReady, mapLoadCount, start]);

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
    if (mapReady) runMap(`window.bionSetMode(${JSON.stringify(mode)})`);
  }, [mapReady, mapLoadCount, mode, runMap]);

  const myInTop = stats?.top.some((r) => r.me);
  const mySchoolInTop = stats?.schoolTop?.some((r) => r.mine);

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
                : `라이더 ${stats?.players ?? '—'}명`}
            </Text>
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
        </View>
      </SafeAreaView>

      <Pressable
        onPress={() => runMap('window.bionCenterMe()')}
        hitSlop={8}
        style={[styles.locateButton, { bottom: land ? 300 : expanded ? 250 : 120 }]}
      >
        <Ionicons name="locate" size={22} color="#fff" />
      </Pressable>

      {land && (
        <LandCard
          land={land}
          onClose={() => {
            setLand(null);
            runMap('window.bionHideTap()');
          }}
        />
      )}

      <View style={[styles.panel, land && { display: 'none' }]} pointerEvents="box-none">
        <Pressable style={styles.handle} onPress={() => setExpanded((v) => !v)} hitSlop={8}>
          <View style={styles.handleBar} />
          <Text style={styles.handleText}>{expanded ? '순위 접기' : '순위 보기'}</Text>
          <Ionicons name={expanded ? 'chevron-down' : 'chevron-up'} size={14} color="#8A8A8A" />
        </Pressable>
        {mode === 'school' ? (
          <>
            {stats?.mySchool ? (
              <View style={styles.myRow}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={styles.label} numberOfLines={1}>
                    우리 학교 · {stats.mySchool.name}
                  </Text>
                  <Text style={styles.myValue}>
                    {areaParts(stats.mySchool.area)[0]}
                    <Text style={styles.myUnit}> {areaParts(stats.mySchool.area)[1]}</Text>
                  </Text>
                </View>
                <View style={styles.myMeta}>
                  <Text style={styles.myRank}>{stats.mySchool.rank}위</Text>
                  <Text style={styles.cellCount}>라이더 {stats.mySchool.riders}명</Text>
                </View>
              </View>
            ) : (
              <Pressable style={styles.registerCard} onPress={() => router.push('/profile-settings')}>
                <Ionicons name="school-outline" size={20} color={ME_COLOR} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.registerTitle}>학교를 등록하면 우리 학교 땅을 볼 수 있어요</Text>
                  <Text style={styles.registerSub}>프로필 설정에서 학교 선택</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#8A8A8A" />
              </Pressable>
            )}

            {expanded && <Text style={styles.label}>학교 순위</Text>}
            {expanded && stats?.schoolTop?.map((r, i) => (
              <View key={r.name} style={styles.leaderRow}>
                <Text style={styles.leaderRank}>{i + 1}</Text>
                <View style={[styles.swatch, { backgroundColor: r.color }]} />
                <Text style={[styles.leaderName, r.mine && styles.meText]} numberOfLines={1}>
                  {r.name}
                  {r.mine ? ' (우리 학교)' : ''}
                  <Text style={styles.riders}> · {r.riders}명</Text>
                </Text>
                <Text style={styles.leaderKm}>{formatArea(r.area)}</Text>
              </View>
            ))}
            {expanded && stats?.mySchool && !mySchoolInTop && (
              <View style={[styles.leaderRow, styles.myLeaderRow]}>
                <Text style={styles.leaderRank}>{stats.mySchool.rank}</Text>
                <View style={[styles.swatch, { backgroundColor: ME_COLOR }]} />
                <Text style={[styles.leaderName, styles.meText]} numberOfLines={1}>
                  {stats.mySchool.name} (우리 학교)
                </Text>
                <Text style={styles.leaderKm}>{formatArea(stats.mySchool.area)}</Text>
              </View>
            )}
          </>
        ) : (
          <>
            <View style={styles.myRow}>
              <View>
                <Text style={styles.label}>내 땅</Text>
                <Text style={styles.myValue}>
                  {stats ? areaParts(stats.myArea)[0] : '—'}
                  <Text style={styles.myUnit}> {stats ? areaParts(stats.myArea)[1] : 'km²'}</Text>
                </Text>
              </View>
              <View style={styles.myMeta}>
                <Text style={styles.myRank}>{stats ? `${stats.myRank}위` : '—'}</Text>
                <Text style={styles.cellCount}>
                  {stats ? `영역 ${stats.myCount ?? 0}곳` : ''}
                </Text>
              </View>
            </View>

            {expanded && <Text style={styles.label}>순위</Text>}
            {expanded && stats?.top.map((r, i) => (
              <View key={r.name} style={styles.leaderRow}>
                <Text style={styles.leaderRank}>{i + 1}</Text>
                <View style={[styles.swatch, { backgroundColor: r.color }]} />
                <Text style={[styles.leaderName, r.me && styles.meText]} numberOfLines={1}>
                  {r.name}
                  {r.me ? ' (나)' : ''}
                </Text>
                <Text style={styles.leaderKm}>{formatArea(r.area)}</Text>
              </View>
            ))}
            {expanded && stats && !myInTop && (
              <View style={[styles.leaderRow, styles.myLeaderRow]}>
                <Text style={styles.leaderRank}>{stats.myRank}</Text>
                <View style={[styles.swatch, { backgroundColor: ME_COLOR }]} />
                <Text style={[styles.leaderName, styles.meText]} numberOfLines={1}>
                  {profile.nickname} (나)
                </Text>
                <Text style={styles.leaderKm}>{formatArea(stats.myArea)}</Text>
              </View>
            )}
          </>
        )}
        {expanded && <Text style={styles.credit}>© OpenStreetMap</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  locateButton: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(10,10,10,0.9)',
    borderWidth: 1,
    borderColor: '#3A3A3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  handle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingBottom: 2,
  },
  handleBar: {
    position: 'absolute',
    top: -2,
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#3A3A3A',
  },
  handleText: {
    color: '#8A8A8A',
    fontSize: 11,
    marginTop: 6,
  },
  modeToggle: {
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
  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 12,
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
