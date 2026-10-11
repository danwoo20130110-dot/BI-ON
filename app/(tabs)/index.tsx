import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import {
  DEFAULT_CENTER,
  KAKAO_MAP_JS_KEY,
  KAKAO_SDK_URL as SDK_URL,
  MAP_BASE_URL,
  MAP_TILE_FILTER as MAP_FILTER,
} from '@/constants/kakao-map';
import { HomeIdle } from '@/components/home-idle';
import { setLastRideSummary } from '@/hooks/ride-summary-store';
import { LatLng, useRideTracker } from '@/hooks/use-ride-tracker';

declare global {
  interface Window {
    kakao: any;
    bionEmit?: (type: string, payload?: any) => void;
  }
}

// 현재 위치 주소는 이 간격(ms)마다만 다시 조회
const GEOCODE_INTERVAL_MS = 30000;

// 지도 제어 스크립트 (웹/네이티브 공통). window.bionEmit 으로 RN 쪽에 이벤트를 보냄
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
    // 컨테이너 크기가 나중에 잡히면 타일이 안 그려지므로 다시 레이아웃
    window.addEventListener('resize', function () { map.relayout(); });
    setTimeout(function () { map.relayout(); }, 300);
    emit('ready');
  };

  // offsetY: 아래 패널에 가려지는 높이의 절반(px) — 그만큼 지도 중심을 내려 핀이 보이는 영역 가운데 오게 함
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

  // 주소 조회는 동시에 여러 개 보내면 응답이 섞이므로 하나씩 순서대로 처리
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
      /* 지도 타일 이미지만 어둡게 반전 (지도 전체에 filter 를 걸면 안드로이드 WebView 메모리 한도를 넘어 안 그려짐) */
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

export default function HomeScreen() {
  const { riding, permissionDenied, current, route, stats, start, stop, getSamples, measureAltitude } =
    useRideTracker();
  const webViewRef = useRef<WebView>(null);
  // 지도가 (재)로드될 때마다 증가 → 현재 위치/경로를 다시 그림
  const [mapLoadCount, setMapLoadCount] = useState(0);
  const mapReady = mapLoadCount > 0;
  const [startAddress, setStartAddress] = useState<string | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string | null>(null);
  const lastGeocodeRef = useRef(0);
  const rideStartedAtRef = useRef(0);
  const drawnCountRef = useRef(0);
  const [panelHeight, setPanelHeight] = useState(0);

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

  // 웹: SDK 직접 로드
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
      style.textContent =
        `#map-container img { filter: ${MAP_FILTER}; }`;
      document.head.appendChild(style);
    }
    new Function(MAP_SCRIPT)();

    const init = () =>
      window.kakao.maps.load(() =>
        (window as any).bionInit('map-container', DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude),
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

  // 현재 위치 표시
  useEffect(() => {
    if (!mapReady) return;
    const p = current ?? DEFAULT_CENTER;
    const offsetY = riding ? Math.round(panelHeight / 2) : 0;
    runMap(`window.bionSetCurrent(${p.latitude}, ${p.longitude}, ${offsetY})`);
  }, [mapReady, mapLoadCount, current, riding, panelHeight, runMap]);

  // 경로: 새 점만 이어 그림 (지도가 늦게 준비되면 전체 다시 그림)
  useEffect(() => {
    if (!mapReady) return;
    if (route.length < drawnCountRef.current || drawnCountRef.current === 0) {
      const pts = route.map((p) => [p.latitude, p.longitude]);
      runMap(`window.bionSetRoute(${JSON.stringify(pts)})`);
    } else {
      route.slice(drawnCountRef.current).forEach((p) => {
        runMap(`window.bionAddPoint(${p.latitude}, ${p.longitude})`);
      });
    }
    drawnCountRef.current = route.length;
  }, [mapReady, mapLoadCount, route, runMap]);

  // 주소 조회
  const firstPoint: LatLng | undefined = route[0];
  useEffect(() => {
    if (!mapReady || !firstPoint) return;
    runMap(`window.bionGeocode('start', ${firstPoint.latitude}, ${firstPoint.longitude})`);
  }, [mapReady, mapLoadCount, firstPoint, runMap]);

  // 이번 라이딩에서 기록된 마지막 지점 기준 (이전 라이딩 위치가 남지 않도록)
  const lastPoint: LatLng | undefined = route[route.length - 1];
  useEffect(() => {
    if (!mapReady || !riding || !lastPoint) return;
    const now = Date.now();
    if (now - lastGeocodeRef.current < GEOCODE_INTERVAL_MS) return;
    lastGeocodeRef.current = now;
    runMap(`window.bionGeocode('current', ${lastPoint.latitude}, ${lastPoint.longitude})`);
  }, [mapReady, riding, lastPoint, runMap]);

  const handleStart = async () => {
    setStartAddress(null);
    setCurrentAddress(null);
    lastGeocodeRef.current = 0;
    rideStartedAtRef.current = Date.now();
    let ok = false;
    try {
      ok = await start();
    } catch (e) {
      console.warn('라이딩 시작 실패', e);
      stop();
    }
    if (!ok) {
      const msg = '라이딩 기록을 위해 위치 권한이 필요합니다. 설정에서 권한을 허용해주세요.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('위치 권한 필요', msg);
    }
  };

  // 라이딩 종료 → 기록을 넘겨주고 통계 화면으로 이동
  const finishRide = async () => {
    const endedAt = Date.now();
    stop();
    // 고도를 아직 못 받았으면 종료 시점에 한 번 더 측정
    const altitude = stats.altitude ?? (await measureAltitude());
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
        <View
          // @ts-ignore
          id="map-container"
          style={StyleSheet.absoluteFill}
        />
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

      {riding ? (
        <View style={styles.panelWrap} pointerEvents="box-none">
          {/* 지도 → 패널로 자연스럽게 어두워지는 단계형 그라데이션 */}
          {FADE_STEPS.map((opacity) => (
            <View key={opacity} style={[styles.fade, { opacity }]} />
          ))}
          <View
            style={styles.panel}
            onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}
          >
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

            <Pressable
              onPress={handleStop}
              style={({ pressed }) => [styles.stopButton, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.stopLabel}>라이딩 종료하기</Text>
            </Pressable>
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
  stopButton: {
    marginTop: 6,
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
