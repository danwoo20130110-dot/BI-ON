import { createElement, useMemo } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

import { DEFAULT_CENTER, KAKAO_SDK_URL, MAP_BASE_URL, MAP_TILE_FILTER } from '@/constants/kakao-map';
import type { LatLng } from '@/hooks/use-ride-tracker';

type Props = {
  route: LatLng[];
  // 경로가 없을 때 지도 중심
  center?: LatLng | null;
  style?: StyleProp<ViewStyle>;
};

// 라이딩 경로를 보여주는 정적 카카오 지도 (경로가 없으면 위치만 표시)
export function RouteMap({ route, center, style }: Props) {
  const html = useMemo(() => {
    const points = route.map((p) => [p.latitude, p.longitude]);
    const c = route[route.length - 1] ?? center ?? DEFAULT_CENTER;
    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      html, body, #map { width:100%; height:100%; margin:0; padding:0; background:#111; }
      #map img { filter: ${MAP_TILE_FILTER}; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script>
      var points = ${JSON.stringify(points)};
      function pin(label, bg, fg) {
        return '<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;' +
          'border-radius:15px;background:' + bg + ';border:2px solid #000;color:' + fg + ';font-size:10px;' +
          'font-weight:700;font-family:sans-serif;box-shadow:0 0 6px rgba(0,0,0,.6)">' + label + '</div>';
      }
      var script = document.createElement('script');
      script.src = '${KAKAO_SDK_URL}';
      script.onload = function () {
        kakao.maps.load(function () {
          var center = new kakao.maps.LatLng(${c.latitude}, ${c.longitude});
          var map = new kakao.maps.Map(document.getElementById('map'), { center: center, level: 4 });
          map.setDraggable(false);
          map.setZoomable(false);
          var path = points.map(function (p) { return new kakao.maps.LatLng(p[0], p[1]); });

          if (path.length >= 2) {
            new kakao.maps.Polyline({
              map: map, path: path, strokeWeight: 6, strokeColor: '#FFA51F', strokeOpacity: 0.95,
            });
            var bounds = new kakao.maps.LatLngBounds();
            path.forEach(function (p) { bounds.extend(p); });
            map.setBounds(bounds, 40, 40, 40, 40);
            new kakao.maps.CustomOverlay({ map: map, position: path[0], content: pin('출발', '#FFFFFF', '#000'), yAnchor: 0.5 });
            new kakao.maps.CustomOverlay({ map: map, position: path[path.length - 1], content: pin('도착', '#FFA51F', '#000'), yAnchor: 0.5, zIndex: 2 });
          } else {
            new kakao.maps.CustomOverlay({ map: map, position: center, content: pin('현재', '#FFA51F', '#000'), yAnchor: 0.5 });
          }
          // WebView 크기가 늦게 잡히면 중심이 어긋나므로 크기가 바뀔 때마다 다시 맞춤
          function refit() {
            map.relayout();
            if (bounds) map.setBounds(bounds, 40, 40, 40, 40);
            else map.setCenter(center);
          }
          window.addEventListener('resize', refit);
          setTimeout(refit, 300);
          setTimeout(refit, 1000);
        });
      };
      document.head.appendChild(script);
    </script>
  </body>
</html>`;
  }, [route, center]);

  return (
    <View style={[styles.container, style]}>
      {Platform.OS === 'web' ? (
        createElement('iframe', {
          srcDoc: html,
          style: { border: 0, width: '100%', height: '100%' },
        })
      ) : (
        <WebView
          source={{ html, baseUrl: MAP_BASE_URL }}
          originWhitelist={['*']}
          style={styles.webview}
          javaScriptEnabled
          scrollEnabled={false}
          pointerEvents="none"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  webview: {
    flex: 1,
    backgroundColor: '#111',
  },
});
