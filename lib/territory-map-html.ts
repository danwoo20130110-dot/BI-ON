// 땅따먹기 지도 페이지 (예시 데이터 전용)
// 실제 도로를 따라 달린 가상 라이딩으로 땅을 표시함.
//  - 한 바퀴 돌아온 라이딩(고리): 고리 안쪽 전체가 땅 → 면으로 칠함
//  - 그냥 쭉 달린 라이딩(직선): 달린 길 폭 100m 가 땅 → 선으로 그림
// 몇 초마다 누군가 새로 달려 땅을 차지하는 것처럼 애니메이션으로 보여줌.

import rides from '@/assets/data/sample-rides.json';
import { DEFAULT_CENTER, KAKAO_SDK_URL, MAP_TILE_FILTER } from '@/constants/kakao-map';
import { SAMPLE_SCHOOLS } from '@/lib/sample-ranking';

export const PLAYER_COUNT = 80;
export const ME_COLOR = '#FFA51F';
// 직선 라이딩: 달린 길 1km = 폭 100m → 0.1km²
export const TRAIL_WIDTH_KM = 0.1;

const SCRIPT = String.raw`
var PLAYER_COUNT = ${PLAYER_COUNT};
var TRAIL_WIDTH_KM = ${TRAIL_WIDTH_KM};
var ME = 0;
var SCHOOLS = ${JSON.stringify(SAMPLE_SCHOOLS)};
// 지도 보기: 'personal' 은 라이더별 색, 'school' 은 학교별 색
var mode = 'personal';
var MY_SCHOOL = null;
var SIMULATE_MS = 4500;
var DRAW_MS = 1600;

function emit(type, payload) {
  var msg = JSON.stringify({ type: type, payload: payload });
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
  else window.parent.postMessage(msg, '*');
}
// 웹(iframe)에서는 부모 창이 보낸 명령만 실행
window.addEventListener('message', function (e) {
  if (e.source === window.parent && typeof e.data === 'string' && e.data.indexOf('bion:') === 0) {
    new Function(e.data.slice(5))();
  }
});
window.onerror = function (msg, url, line) { emit('error', msg + ' (line ' + line + ')'); };

// 항상 같은 결과가 나오는 난수
var seed = 20261011;
function rand() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }

// Google encoded polyline → [[lat, lng], ...]
function decode(s) {
  var pts = [], i = 0, lat = 0, lng = 0;
  while (i < s.length) {
    for (var w = 0; w < 2; w++) {
      var shift = 0, res = 0, b;
      do { b = s.charCodeAt(i++) - 63; res |= (b & 31) << shift; shift += 5; } while (b >= 32);
      var d = res & 1 ? ~(res >> 1) : res >> 1;
      if (w === 0) lat += d; else lng += d;
    }
    pts.push([lat / 1e5, lng / 1e5]);
  }
  return pts;
}
// e 가 있으면 한 바퀴 돈 고리 (e = 안쪽 넓이 km²)
var RIDES = window.__RIDES.map(function (r) {
  var loop = r.e != null;
  return { anchor: r.a, km: r.k, loop: loop, area: loop ? r.e : r.k * TRAIL_WIDTH_KM, pts: decode(r.p) };
});
var R = RIDES.length;

// ── 겹치는 땅 미리 계산: 고리 안에 들어온 길, 서로 교차하는 길 ──
RIDES.forEach(function (r) {
  var b = [90, 180, -90, -180];
  r.pts.forEach(function (p) {
    b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]);
    b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]);
  });
  r.box = b;
});
function boxHit(a, b) { return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]; }
function inside(pt, poly) {
  var y = pt[0], x = pt[1], hit = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var yi = poly[i][0], xi = poly[i][1], yj = poly[j][0], xj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
function cross(p1, p2, p3, p4) {
  function o(a, b, c) { return (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]); }
  var d1 = o(p3, p4, p1), d2 = o(p3, p4, p2), d3 = o(p1, p2, p3), d4 = o(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
function overlapsRide(a, b) {
  if (!boxHit(a.box, b.box)) return false;
  if (a.loop && b.pts.some(function (p) { return inside(p, a.pts); })) return true;
  if (b.loop && a.pts.some(function (p) { return inside(p, b.pts); })) return true;
  for (var i = 1; i < a.pts.length; i++) {
    for (var j = 1; j < b.pts.length; j++) {
      if (cross(a.pts[i - 1], a.pts[i], b.pts[j - 1], b.pts[j])) return true;
    }
  }
  return false;
}
var overlaps = RIDES.map(function () { return []; });
for (var oi = 0; oi < R; oi++) {
  for (var oj = oi + 1; oj < R; oj++) {
    if (overlapsRide(RIDES[oi], RIDES[oj])) { overlaps[oi].push(oj); overlaps[oj].push(oi); }
  }
}

// ── 가상 라이더 ──
var HEADS = ['페달','바람','업힐','한강','라이더','두바퀴','스프린트','클릿','체인','기어','로드','새벽','야간','질주','은륜','케이던스','다운힐','바퀴','자전거','브레이크'];
var TAILS = ['왕','킴','러버','마스터','소년','소녀','장인','요정','대장','고수','신','짱','맨','부엉이','토끼','곰','여우','고양이','호랑이','라이언'];
var players = [{ name: '나', color: '${ME_COLOR}' }, { name: '위아위스', color: '' }];
var used = { '위아위스': 1 };
while (players.length < PLAYER_COUNT) {
  var nm = pick(HEADS) + pick(TAILS);
  if (used[nm]) nm += Math.floor(rand() * 90 + 10);
  if (used[nm]) continue;
  used[nm] = 1;
  players.push({ name: nm, color: '' });
}
// 색: 눈이 편한 차분한 톤, 내 주황색과 겹치는 구간은 피함
for (var i = 1; i < players.length; i++) {
  var h = (i * 137.508) % 360;
  if (h > 15 && h < 50) h = (h + 40) % 360;
  players[i].color = 'hsl(' + h.toFixed(0) + ',35%,' + (60 + (i % 3) * 5) + '%)';
}

// ── 학교: 라이더마다 학교 하나 (나는 프로필에 등록한 학교) ──
for (var si = 1; si < players.length; si++) players[si].school = SCHOOLS[Math.floor(Math.pow(rand(), 1.4) * SCHOOLS.length)];
players[ME].school = null;
var schoolColor = {};
SCHOOLS.forEach(function (name, k) {
  var h = (k * 137.508 + 200) % 360;
  if (h > 15 && h < 50) h = (h + 40) % 360;
  schoolColor[name] = 'hsl(' + h.toFixed(0) + ',35%,' + (60 + (k % 3) * 5) + '%)';
});
function colorFor(pi) {
  if (mode === 'personal') return players[pi].color;
  var sc = players[pi].school;
  if (!sc) return '#777';
  return sc === MY_SCHOOL ? '${ME_COLOR}' : schoolColor[sc] || '#999';
}

// ── 주인: 동네마다 같은 학교 라이더 몇 명이 주로 달림 (그래서 학교 땅도 동네별로 모임) ──
var owner = new Array(R).fill(-1);
var localRiders = {};
function riderFor(anchor) {
  if (!localRiders[anchor]) {
    var home = pick(SCHOOLS);
    var mates = [];
    for (var p = 1; p < players.length; p++) if (players[p].school === home) mates.push(p);
    while (mates.length < 3) mates.push(1 + Math.floor(rand() * (PLAYER_COUNT - 1)));
    localRiders[anchor] = [pick(mates), pick(mates), pick(mates)];
  }
  return rand() < 0.75 ? pick(localRiders[anchor]) : 1 + Math.floor(rand() * (PLAYER_COUNT - 1));
}

var KX = 0.79;
function distTo(r, lat, lng) {
  var best = Infinity;
  r.pts.forEach(function (p) {
    var dy = p[0] - lat, dx = (p[1] - lng) * KX;
    best = Math.min(best, dx * dx + dy * dy);
  });
  return best;
}

// ── 지도 그리기 ──
var map, me, label, rider, shapes = [];
function toPath(pts) { return pts.map(function (p) { return new kakao.maps.LatLng(p[0], p[1]); }); }
function styleOf(i) {
  var o = owner[i], c = o === -1 ? '#888' : colorFor(o);
  // 학교 보기에서는 우리 학교 땅 전체를 '내 땅'처럼 강조
  var mine = mode === 'school' ? o !== -1 && !!MY_SCHOOL && players[o].school === MY_SCHOOL : o === ME;
  if (o === -1) {
    // 주인 없는 곳(아직 아무도 안 달렸거나 남에게 지워진 곳)은 그리지 않음
    return RIDES[i].loop
      ? { strokeOpacity: 0, fillOpacity: 0 }
      : { strokeOpacity: 0 };
  }
  return RIDES[i].loop
    ? { strokeWeight: mine ? 2 : 1.5, strokeColor: c, strokeOpacity: mine ? 0.9 : 0.6, strokeStyle: 'solid', fillColor: c, fillOpacity: mine ? 0.3 : 0.18 }
    : { strokeWeight: mine ? 4 : 3, strokeColor: c, strokeOpacity: mine ? 0.95 : 0.7, strokeStyle: 'solid' };
}

function sendStats() {
  var area = players.map(function () { return 0; });
  var count = players.map(function () { return 0; });
  for (var i = 0; i < R; i++) if (owner[i] !== -1) { area[owner[i]] += RIDES[i].area; count[owner[i]]++; }
  var ranked = players.map(function (p, i) {
    return { name: p.name, color: p.color, me: i === ME, area: area[i], count: count[i] };
  }).sort(function (a, b) { return b.area - a.area; });
  var myRank = 0;
  ranked.forEach(function (r, i) { if (r.me) myRank = i + 1; });
  var loops = 0, lines = 0;
  for (var j = 0; j < R; j++) if (owner[j] === ME) { if (RIDES[j].loop) loops++; else lines++; }

  // 학교 기록 = 그 학교 라이더들 땅의 합
  var bySchool = {};
  players.forEach(function (p, k) {
    if (!p.school) return;
    var row = bySchool[p.school] || (bySchool[p.school] = { name: p.school, area: 0, riders: 0, count: 0 });
    row.area += area[k];
    row.count += count[k];
    row.riders++;
  });
  var schoolRanked = Object.keys(bySchool).map(function (k) {
    var r = bySchool[k];
    r.mine = r.name === MY_SCHOOL;
    r.color = r.mine ? '${ME_COLOR}' : schoolColor[r.name] || '#999';
    return r;
  }).sort(function (a, b) { return b.area - a.area; });
  var mySchoolRow = null;
  schoolRanked.forEach(function (r, k) { if (r.mine) { mySchoolRow = r; r.rank = k + 1; } });

  emit('stats', {
    top: ranked.slice(0, 3),
    myRank: myRank,
    myArea: area[ME],
    myLoops: loops,
    myLines: lines,
    players: players.length,
    schoolTop: schoolRanked.slice(0, 3),
    mySchool: mySchoolRow,
    schoolCount: schoolRanked.length,
  });
}

function showLabel(i, latLng) {
  var o = owner[i], r = RIDES[i];
  if (o === -1) return;
  var who = o === -1 ? '아직 주인 없음' : players[o].name + (o === ME ? ' (나)' : '') +
    (players[o].school ? ' · ' + players[o].school : '');
  var dot = o === -1 ? '#666' : colorFor(o);
  var detail = r.loop
    ? '한 바퀴 ' + r.km.toFixed(1) + 'km · 안쪽 ' + r.area.toFixed(2) + 'km²'
    : '직선 ' + r.km.toFixed(1) + 'km · ' + r.area.toFixed(2) + 'km²';
  label.setContent(
    '<div style="padding:6px 10px;border-radius:8px;background:rgba(20,20,20,.92);color:#eee;font:12px sans-serif;' +
    'white-space:nowrap;transform:translateY(-10px)">' +
    '<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:' + dot + ';margin-right:5px"></span>' +
    '<b>' + who + '</b> · ' + r.anchor + '<br>' + detail + '</div>');
  label.setPosition(latLng);
  label.setMap(map);
}

// 남에게 지워진 땅: 0.6초 동안 서서히 사라짐
function fadeOut(i) {
  var s = styleOf(i), shape = shapes[i], t0 = Date.now();
  // 지우기 직전 주인 색을 유지한 채 투명도만 줄임
  var base = shape.__last || s;
  (function step() {
    var k = 1 - Math.min(1, (Date.now() - t0) / 600);
    var o = { strokeOpacity: (base.strokeOpacity || 0) * k };
    if (RIDES[i].loop) o.fillOpacity = (base.fillOpacity || 0) * k;
    shape.setOptions(o);
    if (k > 0) requestAnimationFrame(step);
    else shape.__last = styleOf(i);
  })();
}
function apply(i) {
  var st = styleOf(i);
  shapes[i].setOptions(st);
  shapes[i].__last = st;
}

// pi 가 target 을 차지: 겹치는 남의 땅은 없어짐. 지워진 땅의 원래 주인 목록을 돌려줌
function capture(target, pi) {
  var victims = [];
  overlaps[target].forEach(function (j) {
    var o = owner[j];
    if (o !== -1 && o !== pi) {
      victims.push(o);
      owner[j] = -1;
      fadeOut(j);
    }
  });
  owner[target] = pi;
  apply(target);
  return victims;
}

// 새로 달리는 애니메이션: 길을 따라 선이 그려지고 작은 점이 맨 앞에서 달림
function animateRide(i, pi, done) {
  var pts = RIDES[i].pts, c = colorFor(pi);
  var trail = new kakao.maps.Polyline({ map: map, path: [], strokeWeight: 3, strokeColor: c, strokeOpacity: 0.9 });
  rider.setContent('<div style="width:10px;height:10px;border-radius:5px;background:' + c + ';border:2px solid #fff"></div>');
  rider.setMap(map);
  var t0 = Date.now();
  (function step() {
    var t = Math.min(1, (Date.now() - t0) / DRAW_MS);
    var path = toPath(pts.slice(0, Math.max(2, Math.ceil(pts.length * t))));
    trail.setPath(path);
    rider.setPosition(path[path.length - 1]);
    if (t < 1) requestAnimationFrame(step);
    else {
      trail.setMap(null);
      rider.setMap(null);
      done();
    }
  })();
}

// RN 에서 내 위치와 닉네임을 받아 땅을 나누고 시뮬레이션 시작
var started = false;
window.bionStart = function (lat, lng, myName, mySchool) {
  if (!map || started) return;
  started = true;
  if (myName) players[ME].name = myName;
  if (mySchool) {
    MY_SCHOOL = mySchool;
    players[ME].school = mySchool;
  }
  map.setCenter(new kakao.maps.LatLng(lat, lng));
  if (R === 0) return;

  // 내 위치에서 가까운 고리 1개 + 직선 2개 = 내 땅
  var near = RIDES.map(function (r, i) { return [distTo(r, lat, lng), i]; }).sort(function (a, b) { return a[0] - b[0]; });
  var myLoop = near.find(function (x) { return RIDES[x[1]].loop; });
  if (myLoop) owner[myLoop[1]] = ME;
  near.filter(function (x) { return !RIDES[x[1]].loop; }).slice(0, 2).forEach(function (x) { owner[x[1]] = ME; });
  // 나머지: 85% 는 주인 있음, 15% 는 빈 곳 (시뮬레이션에서 차지됨)
  for (var i = 0; i < R; i++) if (owner[i] === -1 && rand() < 0.85) owner[i] = riderFor(RIDES[i].anchor);

  // 학교를 등록했으면 내 동네 라이더 2명을 같은 학교 친구로 (우리 학교 땅이 생기도록)
  if (MY_SCHOOL) {
    var myAnchor = RIDES[near[0][1]].anchor;
    riderFor(myAnchor);
    localRiders[myAnchor].slice(0, 2).forEach(function (p) { players[p].school = MY_SCHOOL; });
    for (var q = 0; q < R; q++) if (RIDES[q].anchor === myAnchor && owner[q] === -1) owner[q] = pick(localRiders[myAnchor]);
  }

  // 처음 있던 땅은 그대로 둠. 이후 누군가 새로 차지할 때만 겹치는 남의 땅이 없어짐

  for (var j = 0; j < R; j++) apply(j);
  sendStats();

  var busy = false;
  setInterval(function () {
    if (busy) return;
    var empty = [], taken = [];
    for (var i = 0; i < R; i++) (owner[i] === -1 ? empty : taken).push(i);
    var target = empty.length && rand() < 0.5 ? pick(empty) : pick(taken);
    var prev = owner[target];
    var pi = riderFor(RIDES[target].anchor);
    if (pi === prev || pi === ME) return;
    busy = true;
    var r = RIDES[target];
    animateRide(target, pi, function () {
      var victims = capture(target, pi);
      if (prev !== -1 && prev !== pi) victims.push(prev);
      var names = [];
      victims.forEach(function (v) { if (names.indexOf(players[v].name) === -1) names.push(players[v].name); });
      sendStats();
      emit('capture', {
        who: players[pi].name, school: players[pi].school, where: r.anchor, km: r.km, area: r.area, loop: r.loop,
        mySchoolLost: !!MY_SCHOOL && victims.some(function (v) { return players[v].school === MY_SCHOOL; }) && players[pi].school !== MY_SCHOOL,
        mySchoolGained: !!MY_SCHOOL && players[pi].school === MY_SCHOOL,
        fromMe: victims.indexOf(ME) !== -1,
        erased: victims.length,
        victims: names.slice(0, 2),
      });
      busy = false;
    });
  }, SIMULATE_MS);
};

window.bionSetMode = function (m) {
  mode = m === 'school' ? 'school' : 'personal';
  if (!map) return;
  for (var i = 0; i < R; i++) if (shapes[i]) apply(i);
  label.setMap(null);
};

window.bionSetMe = function (lat, lng) {
  if (!map) return;
  me.setPosition(new kakao.maps.LatLng(lat, lng));
  me.setMap(map);
};

var script = document.createElement('script');
script.src = '${KAKAO_SDK_URL}';
script.onload = function () {
  kakao.maps.load(function () {
    map = new kakao.maps.Map(document.getElementById('map'), {
      center: new kakao.maps.LatLng(${DEFAULT_CENTER.latitude}, ${DEFAULT_CENTER.longitude}),
      level: 7,
    });
    me = new kakao.maps.CustomOverlay({
      position: map.getCenter(), yAnchor: 0.5, zIndex: 5,
      content: '<div style="width:14px;height:14px;border-radius:7px;background:${ME_COLOR};border:3px solid #fff"></div>',
    });
    label = new kakao.maps.CustomOverlay({ yAnchor: 1, zIndex: 7 });
    rider = new kakao.maps.CustomOverlay({ yAnchor: 0.5, xAnchor: 0.5, zIndex: 6 });

    // 고리(면)를 먼저, 직선을 위에 그려서 선이 면에 가려지지 않게 함
    var order = RIDES.map(function (r, i) { return i; }).sort(function (a, b) { return (RIDES[b].loop ? 1 : 0) - (RIDES[a].loop ? 1 : 0); });
    order.forEach(function (i) {
      var opts = styleOf(i);
      opts.map = map;
      opts.path = toPath(RIDES[i].pts);
      var shape = RIDES[i].loop ? new kakao.maps.Polygon(opts) : new kakao.maps.Polyline(opts);
      kakao.maps.event.addListener(shape, 'click', function (e) { showLabel(i, e.latLng); });
      shapes[i] = shape;
      shape.__last = opts;
    });
    kakao.maps.event.addListener(map, 'click', function () { label.setMap(null); });
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
    <script>window.__RIDES = ${JSON.stringify(rides)};</script>
    <script>${SCRIPT}</script>
  </body>
</html>`;
