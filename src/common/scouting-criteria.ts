export const criteria = { attackers: 2, pressureSeconds: 2, switchSeconds: 40 } as const;

export function medianSample(values: (number | null)[]) {
  const sorted = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  const n = sorted.length;
  return { count: n, median: n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null };
}
