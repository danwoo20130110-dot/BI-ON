import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  values: number[];
  color: string;
  height?: number;
  // y축 값 표시 형식
  format?: (v: number) => string;
  // 최소 y 범위 (값 변화가 거의 없을 때 그래프가 과장되지 않게)
  minSpan?: number;
  // y축 최솟값 하한 (속도처럼 0 아래로 내려가면 안 되는 값)
  floor?: number;
  // x축 왼쪽/오른쪽 라벨
  startLabel?: string;
  endLabel?: string;
};

const MAX_POINTS = 60;
const GRID_ROWS = 3;

// 점이 너무 많으면 구간 평균으로 줄임
function downsample(values: number[]) {
  if (values.length <= MAX_POINTS) return values;
  const size = values.length / MAX_POINTS;
  return Array.from({ length: MAX_POINTS }, (_, i) => {
    const chunk = values.slice(Math.floor(i * size), Math.floor((i + 1) * size));
    return chunk.reduce((a, b) => a + b, 0) / chunk.length;
  });
}

// react-native-svg 없이 View 로 그리는 간단한 꺾은선 그래프
export function MiniLineChart({
  values,
  color,
  height = 110,
  format = (v) => v.toFixed(0),
  minSpan = 1,
  floor,
  startLabel,
  endLabel,
}: Props) {
  const [width, setWidth] = useState(0);
  const data = downsample(values);
  const rawMin = Math.min(...data);
  const rawMax = Math.max(...data);
  const pad = Math.max(0, minSpan - (rawMax - rawMin)) / 2;
  let min = rawMin - pad;
  let max = rawMax + pad;
  if (floor != null && min < floor) {
    max += floor - min;
    min = floor;
  }
  const span = max - min || 1;
  const inset = 6;

  const pts = data.map((v, i) => ({
    x: inset + ((width - inset * 2) / Math.max(1, data.length - 1)) * i,
    y: inset + (1 - (v - min) / span) * (height - inset * 2),
  }));

  return (
    <View>
      <View style={styles.row}>
        <View style={[styles.chart, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {Array.from({ length: GRID_ROWS - 1 }).map((_, i) => (
            <View key={i} style={[styles.grid, { top: (height / GRID_ROWS) * (i + 1) }]} />
          ))}
          {width > 0 &&
            pts.slice(1).map((p, i) => {
              const prev = pts[i];
              const dx = p.x - prev.x;
              const dy = p.y - prev.y;
              const length = Math.sqrt(dx * dx + dy * dy);
              return (
                <View
                  key={i}
                  style={[
                    styles.line,
                    {
                      backgroundColor: color,
                      width: length + 1,
                      left: (prev.x + p.x) / 2 - length / 2 - 0.5,
                      top: (prev.y + p.y) / 2 - 1.5,
                      transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
                    },
                  ]}
                />
              );
            })}
        </View>
        <View style={[styles.yAxis, { height }]}>
          <Text style={styles.axisText}>{format(max)}</Text>
          <Text style={styles.axisText}>{format(min)}</Text>
        </View>
      </View>
      {(startLabel || endLabel) && (
        <View style={styles.xAxis}>
          <Text style={styles.axisText}>{startLabel}</Text>
          <Text style={styles.axisText}>{endLabel}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  chart: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#161616',
    overflow: 'hidden',
  },
  grid: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2E2E2E',
  },
  line: {
    position: 'absolute',
    height: 3,
    borderRadius: 1.5,
  },
  yAxis: {
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingVertical: 2,
    minWidth: 30,
  },
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginRight: 36,
  },
  axisText: {
    color: '#8A8A8A',
    fontSize: 10,
  },
});
