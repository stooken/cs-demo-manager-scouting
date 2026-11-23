import type { EconomyType, TeamNumber } from 'csdm/common/types/counter-strike';
import type { HeatmapRound, RoundHeatmapData } from 'csdm/common/types/team-heatmap-timeline';
import type { Point } from 'csdm/common/types/point';

import { coverageCellSize, type CoverageCell } from 'csdm/ui/components/heatmap/round-coverage';

export type ComparisonWindow = { phase: 'round' | 'post-plant'; start: number; end: number };

export function getComparisonWindows(matches: RoundHeatmapData[], width: number) {
  if (!Number.isSafeInteger(width) || width < 1) return [];
  const windows: ComparisonWindow[] = [];
  let maxClock = 0;
  let afterPlant = -1;
  for (const match of matches) {
    maxClock = Math.max(maxClock, match.clockSeconds);
    for (const round of match.rounds) {
      if (round.plantSeconds !== null && round.duration !== null) {
        afterPlant = Math.max(afterPlant, round.duration - round.plantSeconds);
      }
    }
  }
  for (let start = maxClock; start > 0; start -= width) {
    windows.push({ phase: 'round', start, end: Math.max(0, start - width) });
  }
  for (let start = 0; start <= afterPlant; start += width) {
    windows.push({ phase: 'post-plant', start, end: start + width });
  }
  return windows;
}

function getInterval(round: HeatmapRound, clock: number, window?: ComparisonWindow) {
  if (round.duration === null) return;
  if (!window) return { start: 0, end: round.duration, includeEnd: true };
  let start: number;
  let end: number;
  let phaseEnd = round.duration;
  let includePhaseEnd = true;
  if (window.phase === 'round') {
    start = clock - window.start;
    // A timeout can be recorded a few ticks after the HUD reaches zero.
    end = window.end === 0 ? Infinity : clock - window.end;
    if (round.plantSeconds !== null) {
      phaseEnd = round.plantSeconds;
      includePhaseEnd = false;
    }
  } else {
    if (round.plantSeconds === null) return;
    start = round.plantSeconds + window.start;
    end = round.plantSeconds + window.end;
  }
  start = Math.max(0, start);
  const includeEnd = includePhaseEnd && phaseEnd < end;
  end = Math.min(phaseEnd, end);
  if (start < end || (start === end && includeEnd)) return { start, end, includeEnd };
}

export function compareRounds(
  matches: RoundHeatmapData[],
  buy: EconomyType | 'all',
  sides: TeamNumber[],
  window?: ComparisonWindow,
) {
  const points: Point[] = [];
  const cells = new Map<string, CoverageCell>();
  let eligible = 0;
  let observed = 0;
  let matching = 0;
  let missingSamples = 0;
  for (const match of matches) {
    for (const round of match.rounds) {
      if (buy !== 'all' && buy !== round.economy) continue;
      if (sides.length && (round.side === null || !sides.includes(round.side))) continue;
      matching++;
      const interval = getInterval(round, match.clockSeconds, window);
      if (!interval) continue;
      if (round.hasPositionSamples === false) {
        missingSamples++;
        continue;
      }
      eligible++;
      const before = points.length;
      const visited = new Set<string>();
      for (const point of round.points) {
        if (
          point.seconds >= interval.start &&
          (point.seconds < interval.end || (interval.includeEnd && point.seconds === interval.end))
        ) {
          points.push(point);
          const x = Math.floor(point.x / coverageCellSize) * coverageCellSize;
          const y = Math.floor(point.y / coverageCellSize) * coverageCellSize;
          const key = x + ',' + y;
          if (!visited.has(key)) {
            visited.add(key);
            const cell = cells.get(key);
            if (cell) cell.rounds++;
            else cells.set(key, { x, y, rounds: 1 });
          }
        }
      }
      if (points.length > before) observed++;
    }
  }
  return { points, matching, eligible, observed, missingSamples, coverage: { cells: [...cells.values()], eligible } };
}
