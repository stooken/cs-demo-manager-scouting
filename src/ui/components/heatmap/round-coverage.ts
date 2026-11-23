import type { Point } from 'csdm/common/types/point';
export const coverageCellSize = 128;
export type CoverageCell = Point & { rounds: number };
export type RoundCoverage = { cells: CoverageCell[]; eligible: number };

// Fixed thresholds keep the same color meaningful across team buys and window lengths.
export const coverageBands = [
  { minimum: 0.75, color: '#ef4538' },
  { minimum: 0.5, color: '#fb963b' },
  { minimum: 0.25, color: '#f6df58' },
  { minimum: 0, color: '#55b4dc' },
];
