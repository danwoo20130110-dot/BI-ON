import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { formatArea } from '@/lib/territory';

export type LandInfo = {
  owner: string;
  me: boolean;
  school: string | null;
  color: string;
  totalArea: number;
  pieces: number;
  ride: {
    loop: boolean;
    where: string | null;
    area: number;
    at: number | null;
    km: number;
    sec: number | null;
    avg: number | null;
    max: number | null;
    gain: number | null;
    splits: number[] | null;
    last: { km: number; sec: number } | null;
  } | null;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

function formatDate(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분 ${pad2(s)}초`;
}

function formatPace(km: number, sec: number) {
  if (km < 0.01) return '-';
  const per = Math.round(sec / km);
  return `${Math.floor(per / 60)}'${pad2(per % 60)}"`;
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}'${pad2(Math.round(sec % 60))}"`;

// 1km 구간마다: 걸린 시간, 속력, 가장 빠른 구간 대비 막대
export function Splits({ splits, last }: { splits: number[]; last: { km: number; sec: number } | null }) {
  const rows = splits.map((sec, i) => ({ label: `${i + 1}km`, km: 1, sec }));
  if (last) rows.push({ label: `+${last.km.toFixed(2)}km`, km: last.km, sec: last.sec });
  if (!rows.length) return null;
  const speeds = rows.map((r) => r.km / (r.sec / 3600));
  const fastest = Math.max(...speeds);
  const best = rows.length > 1 ? speeds.indexOf(fastest) : -1;

  return (
    <View style={styles.splits}>
      <Text style={styles.splitsTitle}>1km당 기록</Text>
      <ScrollView style={{ maxHeight: 168 }} nestedScrollEnabled>
        {rows.map((r, i) => (
          <View key={r.label} style={styles.splitRow}>
            <Text style={styles.splitKm}>{r.label}</Text>
            <View style={styles.splitTrack}>
              <View
                style={[
                  styles.splitBar,
                  { width: `${Math.max(8, (speeds[i] / fastest) * 100)}%` },
                  i === best && styles.splitBest,
                ]}
              />
            </View>
            <Text style={styles.splitTime}>{r.km === 1 ? mmss(r.sec) : mmss(r.sec / r.km)}</Text>
            <Text style={styles.splitSpeed}>{speeds[i].toFixed(1)}km/h</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.item}>
      <Text style={styles.itemLabel}>{label}</Text>
      <Text style={styles.itemValue}>{value}</Text>
    </View>
  );
}

export function LandCard({ land, onClose }: { land: LandInfo; onClose: () => void }) {
  const r = land.ride;
  const hasStat = !!r && r.sec != null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: land.color }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.owner} numberOfLines={1}>
            {land.owner}
            {land.me ? ' (나)' : ''}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {[land.school, `전체 땅 ${formatArea(land.totalArea)} · 영역 ${land.pieces}곳`].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={22} color="#BDBDBD" />
        </Pressable>
      </View>

      {r ? (
        <>
          <Text style={styles.rideTitle}>
            {r.loop ? '도형을 만든 라이딩' : '선 라이딩'}
            {r.where ? ` · ${r.where}` : ''}
            {r.at ? `  ${formatDate(r.at)}` : ''}
          </Text>
          <View style={styles.grid}>
            <Item label="거리" value={`${r.km.toFixed(2)}km`} />
            <Item label="시간" value={hasStat ? formatDuration(r.sec!) : '-'} />
            <Item label="1km당" value={hasStat ? formatPace(r.km, r.sec!) : '-'} />
            <Item label="평균속력" value={r.avg != null ? `${r.avg.toFixed(1)}km/h` : '-'} />
            <Item label="최고속력" value={r.max != null ? `${r.max.toFixed(1)}km/h` : '-'} />
            <Item label="상승 고도" value={r.gain != null ? `${Math.round(r.gain)}m` : '-'} />
          </View>
          {r.splits && <Splits splits={r.splits} last={r.last} />}
          <Text style={styles.foot}>이 라이딩으로 얻은 땅 {formatArea(r.area)}</Text>
        </>
      ) : (
        <Text style={styles.foot}>이 땅의 라이딩 기록이 없어요</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    padding: 14,
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    backgroundColor: 'rgba(10,10,10,0.96)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  owner: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  sub: {
    color: '#9A9A9A',
    fontSize: 12,
    marginTop: 2,
  },
  rideTitle: {
    color: '#DDDDDD',
    fontSize: 13,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 12,
  },
  item: {
    width: '33.33%',
    gap: 2,
  },
  itemLabel: {
    color: '#9A9A9A',
    fontSize: 11,
  },
  itemValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  splits: {
    gap: 6,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
  },
  splitsTitle: {
    color: '#DDDDDD',
    fontSize: 13,
    fontWeight: '600',
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
  },
  splitKm: {
    width: 58,
    color: '#BDBDBD',
    fontSize: 12,
  },
  splitTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#222',
    overflow: 'hidden',
  },
  splitBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6A6A6A',
  },
  splitBest: {
    backgroundColor: '#FFA51F',
  },
  splitTime: {
    width: 48,
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  splitSpeed: {
    width: 70,
    color: '#9A9A9A',
    fontSize: 12,
    textAlign: 'right',
  },
  foot: {
    color: '#BDBDBD',
    fontSize: 12,
  },
});
