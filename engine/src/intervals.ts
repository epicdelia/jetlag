/** Half-open interval arithmetic on epoch-ms instants: [start, end). */

export type Interval = readonly [number, number];

/** Sort, drop empty, and merge overlapping or touching intervals. */
export function normalize(list: readonly Interval[]): Interval[] {
  const sorted = list.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: [number, number][] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** Intersection of two interval sets. */
export function intersect(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const A = normalize(a);
  const B = normalize(b);
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    const [as, ae] = A[i]!;
    const [bs, be] = B[j]!;
    const s = Math.max(as, bs);
    const e = Math.min(ae, be);
    if (e > s) out.push([s, e]);
    if (ae < be) i++;
    else j++;
  }
  return out;
}

/** a minus b. */
export function subtract(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const B = normalize(b);
  const out: Interval[] = [];
  for (const [s0, e0] of normalize(a)) {
    let s = s0;
    for (const [bs, be] of B) {
      if (be <= s) continue;
      if (bs >= e0) break;
      if (bs > s) out.push([s, bs]);
      s = Math.max(s, be);
      if (s >= e0) break;
    }
    if (s < e0) out.push([s, e0]);
  }
  return out;
}

/** Split intervals at the given cut points (cuts strictly inside an interval only). */
export function splitAt(list: readonly Interval[], cuts: readonly number[]): Interval[] {
  const sortedCuts = [...cuts].sort((x, y) => x - y);
  const out: Interval[] = [];
  for (const [s, e] of list) {
    let cur = s;
    for (const c of sortedCuts) {
      if (c > cur && c < e) {
        out.push([cur, c]);
        cur = c;
      }
    }
    out.push([cur, e]);
  }
  return out;
}

export function length([s, e]: Interval): number {
  return e - s;
}
