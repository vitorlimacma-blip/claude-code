import { scaleSeries, smoothPath } from '../TideLine';

describe('TideLine geometry', () => {
  it('scales a series into the box, highest value on top', () => {
    const points = scaleSeries([0, 50, 100], 200, 60, 10);
    expect(points).toEqual([
      { x: 0, y: 50 },
      { x: 100, y: 30 },
      { x: 200, y: 10 },
    ]);
  });

  it('draws a flat line in the middle for a constant series', () => {
    expect(scaleSeries([5, 5, 5], 100, 40).map((p) => p.y)).toEqual([20, 20, 20]);
  });

  it('passes through every point and never overshoots the data between them', () => {
    const points = scaleSeries([10, 80, 80, 20, 90], 400, 100);
    const d = smoothPath(points);
    for (const p of points) expect(d).toContain(`${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`);
    // Control points stay within the vertical range of the data (monotone cubic).
    const ys = [...d.matchAll(/-?\d+(?:\.\d+)?,(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    const [lo, hi] = [Math.min(...points.map((p) => p.y)), Math.max(...points.map((p) => p.y))];
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(lo - 0.01);
    expect(Math.max(...ys)).toBeLessThanOrEqual(hi + 0.01);
  });

  it('handles empty and single-value series', () => {
    expect(smoothPath([])).toBe('');
    expect(smoothPath(scaleSeries([7], 100, 40))).toBe('M50,20');
  });
});
