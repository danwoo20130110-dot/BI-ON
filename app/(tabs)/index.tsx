import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { WebView } from '@/lib/webview';
import {
  DEFAULT_CENTER,
  KAKAO_MAP_JS_KEY,
  KAKAO_SDK_URL as SDK_URL,
  MAP_BASE_URL,
  MAP_TILE_FILTER as MAP_FILTER,
} from '@/constants/kakao-map';
import { HomeIdle } from '@/components/home-idle';
import { saveMyRide } from '@/hooks/my-rides-store';
import { setLastRideSummary } from '@/hooks/ride-summary-store';
import {
  getLiveId,
  liveEnd,
  liveLocation,
  livePos,
  liveStart,
  subscribeLive,
} from '@/lib/live-client';
import { LatLng, useRideTracker } from '@/hooks/use-ride-tracker';

declare global {
  interface Window {
    kakao: any;
    bionEmit?: (type: string, payload?: any) => void;
  }
}

const GEOCODE_INTERVAL_MS = 30000;

const MAP_SCRIPT = `
(function () {
  var map, polyline, startOverlay, currentOverlay, geocoder;
  function emit(type, payload) { if (window.bionEmit) window.bionEmit(type, payload); }
  function pin(label) {
    return '<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;' +
      'border-radius:15px;background:#FFA51F;border:2px solid #000;color:#000;font-size:10px;' +
      'font-weight:700;font-family:sans-serif;box-shadow:0 0 6px rgba(0,0,0,.6)">' + label + '</div>';
  }
  function ll(p) { return new kakao.maps.LatLng(p[0], p[1]); }

  window.bionInit = function (elId, lat, lng) {
    var center = new kakao.maps.LatLng(lat, lng);
    map = new kakao.maps.Map(document.getElementById(elId), { center: center, level: 4 });
    geocoder = new kakao.maps.services.Geocoder();
    polyline = new kakao.maps.Polyline({
      map: map, path: [], strokeWeight: 6, strokeColor: '#FFA51F', strokeOpacity: 0.95,
    });
    startOverlay = new kakao.maps.CustomOverlay({ position: center, content: pin('시작'), yAnchor: 0.5 });
    currentOverlay = new kakao.maps.CustomOverlay({ position: center, content: pin('현재'), yAnchor: 0.5, zIndex: 2 });
    window.addEventListener('resize', function () { map.relayout(); });
    setTimeout(function () { map.relayout(); }, 300);
    emit('ready');
  };

  window.bionSetCurrent = function (lat, lng, offsetY) {
    if (!map) return;
    var p = ll([lat, lng]);
    currentOverlay.setPosition(p);
    currentOverlay.setMap(map);
    if (offsetY) {
      var proj = map.getProjection();
      var pt = proj.pointFromCoords(p);
      map.panTo(proj.coordsFromPoint(new kakao.maps.Point(pt.x, pt.y + offsetY)));
    } else {
      map.panTo(p);
    }
  };

  window.bionSetRoute = function (points) {
    if (!map) return;
    polyline.setPath(points.map(ll));
    if (points.length) {
      startOverlay.setPosition(ll(points[0]));
      startOverlay.setMap(map);
    } else {
      startOverlay.setMap(null);
    }
  };

  window.bionAddPoint = function (lat, lng) {
    if (!map) return;
    var path = polyline.getPath();
    path.push(ll([lat, lng]));
    polyline.setPath(path);
    if (path.length === 1) {
      startOverlay.setPosition(path[0]);
      startOverlay.setMap(map);
    }
  };

  var geoQueue = [], geoBusy = false;
  function nextGeocode() {
    if (geoBusy || !geoQueue.length) return;
    var job = geoQueue.shift();
    geoBusy = true;
    geocoder.coord2Address(job.lng, job.lat, function (result, status) {
      geoBusy = false;
      if (status === kakao.maps.services.Status.OK && result[0]) {
        var r = result[0];
        var text = r.road_address ? r.road_address.address_name : r.address.address_name;
        emit('address', { kind: job.kind, text: text });
      }
      nextGeocode();
    });
  }
  var others = {};
  function colorOf(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    h = Math.abs(h) % 360;
    if (h > 15 && h < 55) h += 60;
    return 'hsl(' + h + ',80%,60%)';
  }
  window.bionOthers = function (list) {
    if (!map) return;
    var seen = {};
    list.forEach(function (o) {
      seen[o.id] = true;
      var c = colorOf(o.id);
      var e = others[o.id];
      if (!e) {
        e = others[o.id] = {
          line: new kakao.maps.Polyline({ map: map, path: [], strokeWeight: 5, strokeColor: c, strokeOpacity: 0.9 }),
          dot: new kakao.maps.CustomOverlay({ yAnchor: 1.2, zIndex: 3 }),
        };
      }
      var path = o.trail.map(ll);
      e.line.setPath(path);
      if (path.length) {
        e.dot.setContent('<div style="padding:2px 8px;border-radius:10px;background:' + c +
          ';color:#000;font:bold 11px sans-serif;white-space:nowrap">' + o.name + '</div>');
        e.dot.setPosition(path[path.length - 1]);
        e.dot.setMap(map);
      }
    });
    Object.keys(others).forEach(function (id) {
      if (seen[id]) return;
      others[id].line.setMap(null);
      others[id].dot.setMap(null);
      delete others[id];
    });
  };

  window.bionGeocode = function (kind, lat, lng) {
    if (!geocoder) return;
    geoQueue.push({ kind: kind, lat: lat, lng: lng });
    nextGeocode();
  };
})();
`;

const htmlContent = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      html, body, #map { width:100%; height:100%; margin:0; padding:0; background:#111; }
      #map img { filter: ${MAP_FILTER}; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      window.bionEmit = function (type, payload) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload }));
      };
      window.onerror = function (msg, url, line) {
        window.bionEmit('error', 'JS 에러: ' + msg + ' (line ' + line + ')');
      };
      var failedTiles = 0;
      window.addEventListener('error', function (e) {
        var t = e.target;
        if (t && (t.tagName === 'IMG' || t.tagName === 'SCRIPT') && failedTiles++ < 3) {
          window.bionEmit('error', t.tagName + ' 로드 실패: ' + (t.src || ''));
        }
      }, true);
      ${MAP_SCRIPT}
      var script = document.createElement('script');
      script.src = '${SDK_URL}';
      script.onload = function () {
        kakao.maps.load(function () {
          window.bionInit('map', ${DEFAULT_CENTER.latitude}, ${DEFAULT_CENTER.longitude});
        });
      };
      script.onerror = function () {
        window.bionEmit('error', '카카오 SDK 스크립트 로드 실패 (네트워크/키 문제)');
      };
      document.head.appendChild(script);
    </script>
  </body>
</html>
`;

function BionLogo({ width = 90 }: { width?: number }) {
  return (
    <Image
      source={require('@/assets/images/BION.png')}
      style={{ width, height: width * 0.28 }}
      resizeMode="contain"
    />
  );
}

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min ${String(s).padStart(2, '0')}s`;
}

const dash = (v: number | null, digits: number, unit: string) =>
  v == null ? '—' : `${v.toFixed(digits)}${unit}`;

const buzz = (type: Haptics.NotificationFeedbackType) =>
  Haptics.notificationAsync(type).catch(() => {});

// 라이딩 중에는 화면이 꺼지지 않게
function KeepAwake() {
  useKeepAwake();
  return null;
}

export default function HomeScreen() {
  const {
    riding,
    paused,
    pause,
    resume,
    permissionDenied,
    current,
    route,
    stats,
    start,
    stop,
    getSamples,
    getSplits,
    measureAltitude,
  } = useRideTracker();
  const webViewRef = useRef<WebView>(null);
  const [mapLoadCount, setMapLoadCount] = useState(0);
  const mapReady = mapLoadCount > 0;
  const [startAddress, setStartAddress] = useState<string | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string | null>(null);
  const lastGeocodeRef = useRef(0);
  const rideStartedAtRef = useRef(0);
  const drawnCountRef = useRef(0);
  const [panelHeight, setPanelHeight] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);
  // 다른 사람이 내 경로를 끊으면 그 전까지 달린 부분은 땅으로 치지 않음
  const [cutIndex, setCutIndex] = useState(0);
  const [notice, setNotice] = useState<{ text: string; bad: boolean } | null>(null);
  const routeLenRef = useRef(0);
  const sentRef = useRef(0);
  const othersRef = useRef(new Map<string, { name: string; trail: [number, number][] }>());
  const liveRoute = useMemo(() => route.slice(cutIndex), [route, cutIndex]);
  useEffect(() => {
    routeLenRef.current = route.length;
  }, [route]);

  const runMap = useCallback((js: string) => {
    if (Platform.OS === 'web') {
      new Function(js)();
    } else {
      webViewRef.current?.injectJavaScript(`${js};true;`);
    }
  }, []);

  const handleMapEvent = useCallback((type: string, payload: any) => {
    if (type === 'ready') {
      console.log('Kakao map: 지도 준비 완료');
      drawnCountRef.current = 0;
      setMapLoadCount((c) => c + 1);
    } else if (type === 'address') {
      if (payload.kind === 'start') setStartAddress(payload.text);
      else setCurrentAddress(payload.text);
    } else if (type === 'error') {
      console.error('Kakao map error:', payload);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!KAKAO_MAP_JS_KEY) {
      console.error('카카오 맵 API 키(EXPO_PUBLIC_KAKAO_MAP_JS_KEY)가 설정되지 않았습니다.');
      return;
    }

    window.bionEmit = handleMapEvent;
    if (!document.getElementById('bion-map-style')) {
      const style = document.createElement('style');
      style.id = 'bion-map-style';
      style.textContent = `#map-container img { filter: ${MAP_FILTER}; }`;
      document.head.appendChild(style);
    }
    new Function(MAP_SCRIPT)();

    const init = () =>
      window.kakao.maps.load(() =>
        (window as any).bionInit(
          'map-container',
          DEFAULT_CENTER.latitude,
          DEFAULT_CENTER.longitude,
        ),
      );

    if (window.kakao?.maps) {
      init();
      return;
    }

    const scriptId = 'kakao-map-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = SDK_URL;
      script.onerror = () => console.error('카카오 맵 스크립트 로드에 실패했습니다.');
      document.head.appendChild(script);
    }
    script.addEventListener('load', init);
    return () => script?.removeEventListener('load', init);
  }, [handleMapEvent]);

  useEffect(() => {
    if (!mapReady) return;
    const p = current ?? DEFAULT_CENTER;
    const offsetY = riding ? Math.round(panelHeight / 2) : 0;
    runMap(`window.bionSetCurrent(${p.latitude}, ${p.longitude}, ${offsetY})`);
  }, [mapReady, mapLoadCount, current, riding, panelHeight, runMap]);

  useEffect(() => {
    if (!mapReady) return;
    if (liveRoute.length < drawnCountRef.current || drawnCountRef.current === 0) {
      const pts = liveRoute.map((p) => [p.latitude, p.longitude]);
      runMap(`window.bionSetRoute(${JSON.stringify(pts)})`);
    } else {
      liveRoute.slice(drawnCountRef.current).forEach((p) => {
        runMap(`window.bionAddPoint(${p.latitude}, ${p.longitude})`);
      });
    }
    drawnCountRef.current = liveRoute.length;
  }, [mapReady, mapLoadCount, liveRoute, runMap]);

  const drawOthers = useCallback(() => {
    const list = [...othersRef.current.entries()].map(([id, o]) => ({
      id,
      ...o,
    }));
    runMap(`window.bionOthers(${JSON.stringify(list)})`);
  }, [runMap]);

  useEffect(() => {
    const others = othersRef.current;
    const unsub = subscribeLive((e) => {
      const myId = getLiveId();
      if (e.type === 'snapshot') {
        others.clear();
        e.riders.forEach(
          (r) => r.id !== myId && others.set(r.id, { name: r.name, trail: r.trail }),
        );
      } else if (e.type === 'end') {
        others.delete(e.id);
      } else if (e.type === 'pos') {
        if (e.id === myId) return;
        const o = others.get(e.id) ?? { name: e.name, trail: [] };
        o.trail.push([e.lat, e.lng]);
        others.set(e.id, o);
      } else if (e.type === 'cut') {
        if (e.victim === myId) {
          buzz(Haptics.NotificationFeedbackType.Error);
          setCutIndex(Math.max(0, routeLenRef.current - 1));
          setNotice({
            text: `${e.byName}님이 경로를 끊었어요. 지금까지 달린 땅은 무효예요`,
            bad: true,
          });
        } else {
          const o = others.get(e.victim);
          if (o) o.trail = o.trail.slice(-1);
          if (e.by === myId)
            setNotice({
              text: `${e.victimName}님의 경로를 끊었어요!`,
              bad: false,
            });
        }
      }
      drawOthers();
    });
    return unsub;
  }, [drawOthers]);

  // 내 위치 근처 라이더만 받음
  useEffect(() => {
    if (current) liveLocation(current.latitude, current.longitude);
  }, [current]);

  useEffect(() => {
    if (mapReady) drawOthers();
  }, [mapReady, mapLoadCount, drawOthers]);

  useEffect(() => {
    if (riding) {
      sentRef.current = 0;
      liveStart();
    } else {
      liveEnd();
    }
  }, [riding]);

  useEffect(() => {
    if (!riding) return;
    route.slice(sentRef.current).forEach((p) => livePos(p.latitude, p.longitude));
    sentRef.current = route.length;
  }, [riding, route]);

  // 라이딩 중 안드로이드 뒤로가기로 앱 화면이 닫히면 진행 중인 라이딩이 사라짐
  useEffect(() => {
    if (!riding) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setNotice({ text: '라이딩 중이에요. 끝내려면 종료 버튼을 눌러 주세요', bad: false });
      return true;
    });
    return () => sub.remove();
  }, [riding]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const firstPoint: LatLng | undefined = route[0];
  useEffect(() => {
    if (!mapReady || !firstPoint) return;
    runMap(`window.bionGeocode('start', ${firstPoint.latitude}, ${firstPoint.longitude})`);
  }, [mapReady, mapLoadCount, firstPoint, runMap]);

  const lastPoint: LatLng | undefined = route[route.length - 1];
  useEffect(() => {
    if (!mapReady || !riding || !lastPoint) return;
    const now = Date.now();
    if (now - lastGeocodeRef.current < GEOCODE_INTERVAL_MS) return;
    lastGeocodeRef.current = now;
    runMap(`window.bionGeocode('current', ${lastPoint.latitude}, ${lastPoint.longitude})`);
  }, [mapReady, riding, lastPoint, runMap]);

  const handleStart = async () => {
    setPanelOpen(true);
    setStartAddress(null);
    setCurrentAddress(null);
    lastGeocodeRef.current = 0;
    rideStartedAtRef.current = Date.now();
    setCutIndex(0);
    setNotice(null);
    let ok = false;
    try {
      ok = await start();
    } catch (e) {
      console.warn('라이딩 시작 실패', e);
      stop();
    }
    if (ok) buzz(Haptics.NotificationFeedbackType.Success);
    if (!ok) {
      const msg = '라이딩 기록을 위해 위치 권한이 필요합니다. 설정에서 권한을 허용해주세요.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('위치 권한 필요', msg);
    }
  };

  const togglePause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (paused) resume();
    else pause();
  };

  const recenter = () => {
    const p = current ?? DEFAULT_CENTER;
    const offsetY = riding ? Math.round(panelHeight / 2) : 0;
    runMap(`window.bionSetCurrent(${p.latitude}, ${p.longitude}, ${offsetY})`);
  };

  const finishRide = async () => {
    buzz(Haptics.NotificationFeedbackType.Success);
    const endedAt = Date.now();
    stop();
    const altitude = stats.altitude ?? (await measureAltitude());
    await saveMyRide(liveRoute, {
      at: rideStartedAtRef.current,
      km: stats.distanceKm,
      sec: stats.elapsedSec,
      avg: stats.avgSpeedKmh ?? 0,
      max: stats.maxSpeedKmh ?? 0,
      gain: stats.elevationGain,
      ...getSplits(),
    }).catch(() => {});
    setLastRideSummary({
      startedAt: rideStartedAtRef.current,
      endedAt,
      stats: {
        ...stats,
        altitude,
        minAltitude: stats.minAltitude ?? altitude,
        maxAltitude: stats.maxAltitude ?? altitude,
      },
      route,
      samples: getSamples(),
      lastLocation: current,
      startAddress,
      endAddress: currentAddress ?? startAddress,
    });
    router.push('/ride-summary');
  };

  const handleStop = () => {
    const msg = '라이딩을 종료할까요?';
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) finishRide();
      return;
    }
    Alert.alert('라이딩 종료', msg, [
      { text: '취소', style: 'cancel' },
      { text: '종료', style: 'destructive', onPress: finishRide },
    ]);
  };

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' ? (
        <View id="map-container" style={StyleSheet.absoluteFill} />
      ) : (
        <WebView
          ref={webViewRef}
          source={{ html: htmlContent, baseUrl: MAP_BASE_URL }}
          originWhitelist={['*']}
          style={[StyleSheet.absoluteFill, { backgroundColor: '#111' }]}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          scrollEnabled={false}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              handleMapEvent(data.type, data.payload);
            } catch {
              console.log('Kakao map raw:', event.nativeEvent.data);
            }
          }}
        />
      )}

      {riding && (
        <View style={styles.topBar} pointerEvents="box-none">
          <BionLogo width={90} />
        </View>
      )}

      {riding && <KeepAwake />}
      <Pressable
        onPress={recenter}
        hitSlop={8}
        style={[styles.locateButton, { bottom: riding ? panelHeight + 12 : 120 }]}
      >
        <Ionicons name="locate" size={22} color="#fff" />
      </Pressable>

      {riding ? (
        <View style={styles.panelWrap} pointerEvents="box-none">
          {FADE_STEPS.map((opacity) => (
            <View key={opacity} style={[styles.fade, { opacity }]} />
          ))}
          <View style={styles.panel} onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}>
            <Pressable style={styles.handle} onPress={() => setPanelOpen((v) => !v)} hitSlop={12}>
              <View style={styles.handleBar} />
              <Ionicons
                name={panelOpen ? 'chevron-down' : 'chevron-up'}
                size={16}
                color="#8A8A8A"
              />
            </Pressable>
            {paused && (
              <View style={styles.pausedBadge}>
                <Text style={styles.pausedText}>일시정지 중 · 시간과 거리가 멈춰 있어요</Text>
              </View>
            )}
            {notice && (
              <View style={[styles.notice, notice.bad && styles.noticeBad]}>
                <Ionicons
                  name={notice.bad ? 'cut' : 'flash'}
                  size={16}
                  color={notice.bad ? '#FF5A5F' : ORANGE}
                />
                <Text style={styles.noticeText}>{notice.text}</Text>
              </View>
            )}
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>주행거리</Text>
                <Text style={styles.bigValue}>{stats.distanceKm.toFixed(2)}km</Text>
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>라이딩 시간</Text>
                <Text style={styles.bigValue}>{formatDuration(stats.elapsedSec)}</Text>
              </View>
            </View>

            {panelOpen && (
              <>
                <View style={styles.divider} />

                <View style={styles.row}>
                  <View style={styles.col}>
                    <Text style={styles.label}>평균속력</Text>
                    <Text style={styles.value}>{(stats.avgSpeedKmh ?? 0).toFixed(1)}km/h</Text>
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.label}>최고속력</Text>
                    <Text style={styles.value}>{(stats.maxSpeedKmh ?? 0).toFixed(1)}km/h</Text>
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={styles.col}>
                    <Text style={styles.label}>현재고도</Text>
                    <Text style={styles.value}>{dash(stats.altitude, 0, 'm')}</Text>
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.label}>위치</Text>
                    <View style={styles.locRow}>
                      <Ionicons name="location-outline" size={13} color={ORANGE} />
                      <Text style={styles.locText} numberOfLines={1}>
                        시작위치 {startAddress ?? '—'}
                      </Text>
                    </View>
                    <View style={styles.locRow}>
                      <Ionicons name="location-outline" size={13} color={ORANGE} />
                      <Text style={styles.locText} numberOfLines={1}>
                        현재위치 {currentAddress ?? '—'}
                      </Text>
                    </View>
                  </View>
                </View>
              </>
            )}

            <View style={styles.actions}>
              <Pressable
                onPress={togglePause}
                style={({ pressed }) => [styles.pauseButton, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name={paused ? 'play' : 'pause'} size={18} color="#fff" />
                <Text style={styles.pauseLabel}>{paused ? '이어서' : '일시정지'}</Text>
              </Pressable>
              <Pressable
                onPress={handleStop}
                style={({ pressed }) => [styles.stopButton, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.stopLabel}>라이딩 종료하기</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        <HomeIdle onStart={handleStart} permissionDenied={permissionDenied} />
      )}
    </View>
  );
}

const ORANGE = '#FFA51F';
const FADE_STEPS = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    position: 'absolute',
    top: 62,
    left: 24,
    zIndex: 10,
    elevation: 10,
  },
  panelWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'flex-end',
    zIndex: 10,
    elevation: 10,
  },
  fade: {
    height: 10,
    backgroundColor: '#000',
  },
  panel: {
    backgroundColor: '#000',
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 18,
  },
  row: {
    flexDirection: 'row',
  },
  col: {
    flex: 1,
    gap: 6,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  bigValue: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  value: {
    color: ORANGE,
    fontSize: 15,
    fontWeight: '600',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#5A5A5A',
  },
  locRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locText: {
    flex: 1,
    color: ORANGE,
    fontSize: 12,
  },
  handle: {
    alignItems: 'center',
    marginTop: -6,
    marginBottom: -8,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A3A',
    marginBottom: 2,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: ORANGE,
  },
  noticeBad: {
    borderColor: '#FF5A5F',
  },
  noticeText: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  pauseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 52,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: '#262626',
  },
  pauseLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
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
    zIndex: 11,
    elevation: 11,
  },
  pausedBadge: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 100,
    backgroundColor: '#262626',
  },
  pausedText: {
    color: ORANGE,
    fontSize: 12,
    fontWeight: '700',
  },
  stopButton: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopLabel: {
    color: '#000',
    fontSize: 17,
    fontWeight: '700',
  },
});
