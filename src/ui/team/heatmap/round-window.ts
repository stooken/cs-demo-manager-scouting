import type { HeatmapRound } from 'csdm/common/types/team-heatmap-timeline';

export function getRoundWindow(round: HeatmapRound, cursor: number, seconds: number) {
  const duration = round.duration ?? 0;
  const end = Math.min(duration, Math.max(cursor, 0));
  const phaseStart = round.plantSeconds !== null && end >= round.plantSeconds ? round.plantSeconds : 0;
  const start = Math.max(phaseStart, end - seconds);
  // A trailing window shows only evidence available at the selected tick. Include the phase's first tick.
  const points = round.points.filter(
    (point) => (point.seconds > start || (start === phaseStart && point.seconds === start)) && point.seconds <= end,
  );
  return { start, end, duration, points };
}
