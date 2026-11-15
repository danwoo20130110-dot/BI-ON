import { DEFAULT_CENTER, KAKAO_SDK_URL, MAP_TILE_FILTER } from '@/constants/kakao-map';

export const ME_COLOR = '#FFA51F';

// 땅 계산은 서버가 하고, 이 지도는 받은 땅을 그리고 누른 위치만 알려줌
const SCRIPT = String.raw`
var mode = 'personal';
// [{ id, me, mine, color, schoolColor, polys: GeoJSON MultiPolygon 좌표 }]
var lands = [];

function emit(type, payload) {
  var msg = JSON.stringify({ type: type, payload: payload });
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
  else window.parent.postMessage(msg, '*');
}
window.addEventListener('message', function (e) {
  if (e.source === window.parent && typeof e.data === 'string' && e.data.indexOf('bion:') === 0) {
    new Function(e.data.slice(5))();
  }
});
window.onerror = function (msg, url, line) { emit('error', msg + ' (line ' + line + ')'); };

var map, me, tapMarker, drawn = [];
function ringPath(ring) { return ring.map(function (c) { return new kakao.maps.LatLng(c[1], c[0]); }); }
function isMine(l) { return mode === 'school' ? l.mine : l.me; }
function colorOf(l) { return mode === 'school' ? l.schoolColor : l.color; }
function styleFor(l) {
  var c = colorOf(l), mine = isMine(l);
  return {
    zIndex: mine ? 3 : 1,
    strokeWeight: mine ? 3 : 1.5,
    strokeColor: c,
    strokeOpacity: mine ? 1 : 0.85,
    strokeStyle: 'solid',
    fillColor: c,
    fillOpacity: mine ? 0.5 : 0.32,
  };
}
function renderAll() {
  drawn.forEach(function (s) { s.setMap(null); });
  drawn = [];
  lands.forEach(function (l) {
    l.polys.forEach(function (poly) {
      var opts = styleFor(l);
      opts.map = map;
      opts.path = poly.map(ringPath);
      var shape = new kakao.maps.Polygon(opts);
      kakao.maps.event.addListener(shape, 'click', function (e) { handleTap(e.latLng); });
      drawn.push(shape);
    });
  });
}

function inRing(pt, ring) {
  var x = pt[0], y = pt[1], hit = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
function inPolys(pt, polys) {
  return polys.some(function (poly) {
    if (!inRing(pt, poly[0])) return false;
    for (var h = 1; h < poly.length; h++) if (inRing(pt, poly[h])) return false;
    return true;
  });
}

var lastTap = 0;
// 땅 도형과 지도 둘 다 이 함수로 처리 (한 번 누름에 두 번 불리면 무시)
function handleTap(latLng) {
  var now = Date.now();
  if (now - lastTap < 400) return;
  lastTap = now;
  var pt = [latLng.getLng(), latLng.getLat()];
  var order = lands.slice().sort(function (a, b) { return (isMine(b) ? 1 : 0) - (isMine(a) ? 1 : 0); });
  for (var k = 0; k < order.length; k++) {
    if (inPolys(pt, order[k].polys)) {
      tapMarker.setPosition(latLng);
      tapMarker.setMap(map);
      emit('tap', { owner: order[k].id, color: colorOf(order[k]), lat: pt[1], lng: pt[0] });
      return;
    }
  }
  tapMarker.setMap(null);
  emit('tap', null);
}

function sendBounds() {
  var b = map.getBounds(), sw = b.getSouthWest(), ne = b.getNorthEast();
  emit('bounds', { minLng: sw.getLng(), minLat: sw.getLat(), maxLng: ne.getLng(), maxLat: ne.getLat() });
}

var started = false;
window.bionStart = function (lat, lng) {
  if (!map || started) return;
  started = true;
  map.setCenter(new kakao.maps.LatLng(lat, lng));
  sendBounds();
};

window.bionSetLands = function (list) {
  if (!map) return;
  lands = list;
  renderAll();
};

window.bionSetMode = function (m) {
  mode = m === 'school' ? 'school' : 'personal';
  if (map) renderAll();
};

window.bionHideTap = function () {
  if (tapMarker) tapMarker.setMap(null);
};

var myPos = null;
window.bionSetMe = function (lat, lng) {
  if (!map) return;
  myPos = new kakao.maps.LatLng(lat, lng);
  me.setPosition(myPos);
  me.setMap(map);
};
window.bionCenterMe = function () {
  if (map && myPos) map.panTo(myPos);
};

var script = document.createElement('script');
script.src = '${KAKAO_SDK_URL}';
script.onload = function () {
  kakao.maps.load(function () {
    map = new kakao.maps.Map(document.getElementById('map'), {
      center: new kakao.maps.LatLng(${DEFAULT_CENTER.latitude}, ${DEFAULT_CENTER.longitude}),
      level: 6,
    });
    me = new kakao.maps.CustomOverlay({
      position: map.getCenter(), yAnchor: 0.5, zIndex: 5,
      content: '<div style="width:14px;height:14px;border-radius:7px;background:${ME_COLOR};border:3px solid #fff"></div>',
    });
    tapMarker = new kakao.maps.CustomOverlay({
      yAnchor: 0.5, zIndex: 8,
      content: '<div style="width:14px;height:14px;border-radius:7px;background:#fff;border:3px solid #000;box-shadow:0 0 0 2px #fff"></div>',
    });
    kakao.maps.event.addListener(map, 'click', function (e) { handleTap(e.latLng); });
    // 지도를 옮기거나 확대하면 보이는 범위의 땅을 다시 받음
    kakao.maps.event.addListener(map, 'idle', function () { if (started) sendBounds(); });
    window.addEventListener('resize', function () { map.relayout(); });
    setTimeout(function () { map.relayout(); }, 300);
    emit('ready');
  });
};
script.onerror = function () { emit('error', '카카오 SDK 로드 실패'); };
document.head.appendChild(script);
`;

export const TERRITORY_MAP_HTML = `<!DOCTYPE html>
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
    <script>${SCRIPT}</script>
  </body>
</html>`;
