import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from './theme';

// The Maré Clara motif (§4): a soft line through a real series, e.g. the
// balance day by day. It always draws data the screen states in words
// (`accessibilityLabel`); used without data it must be marked decorative.

export interface Point {
  x: number;
  y: number;
}

/** Scales a series of values into points inside `width` × `height`, with `pad` on top and bottom. */
export function scaleSeries(values: number[], width: number, height: number, pad = 6): Point[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values.map((v, i) => ({
    x: values.length > 1 ? i * step : width / 2,
    y: max === min ? height / 2 : pad + (1 - (v - min) / span) * (height - 2 * pad),
  }));
}

/**
 * SVG path of a monotone cubic curve through the points (Fritsch–Carlson), so
 * the curve never swings above or below the data between two days.
 */
export function smoothPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  const n = points.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    slope.push((points[i + 1].y - points[i].y) / (dx[i] || 1));
  }
  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  tangent.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      tangent[i] = (3 / h) * a * slope[i];
      tangent[i + 1] = (3 / h) * b * slope[i];
    }
  }
  const r = (v: number) => Math.round(v * 100) / 100;
  let d = `M${r(points[0].x)},${r(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const p = points[i];
    const q = points[i + 1];
    const third = dx[i] / 3;
    d += ` C${r(p.x + third)},${r(p.y + tangent[i] * third)} ${r(q.x - third)},${r(q.y - tangent[i + 1] * third)} ${r(q.x)},${r(q.y)}`;
  }
  return d;
}

export function TideLine({
  values,
  width,
  height = 56,
  color,
  accessibilityLabel,
}: {
  values: number[];
  width: number;
  height?: number;
  color?: string;
  /** What the line shows, in words. Without it the line is treated as decorative. */
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const stroke = color ?? theme.colors.chart[0];
  const points = scaleSeries(values, width, height);
  const line = smoothPath(points);
  const last = points[points.length - 1];
  const area = points.length > 1 ? `${line} L${width},${height} L0,${height} Z` : '';
  return (
    <View
      accessible={!!accessibilityLabel}
      role={accessibilityLabel ? 'img' : undefined}
      aria-label={accessibilityLabel}
      aria-hidden={!accessibilityLabel}
      style={{ width, height }}
    >
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="tide" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stroke} stopOpacity={0.22} />
            <Stop offset="1" stopColor={stroke} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {area !== '' && <Path d={area} fill="url(#tide)" />}
        <Path d={line} stroke={stroke} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        {last && <Circle cx={last.x} cy={last.y} r={4} fill={theme.colors.surface} stroke={stroke} strokeWidth={2.5} />}
      </Svg>
    </View>
  );
}
