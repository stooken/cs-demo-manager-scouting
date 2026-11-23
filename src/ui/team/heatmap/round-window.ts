import type { HeatmapRound } from 'csdm/common/types/team-heatmap-timeline';

export function getRoundWindow(round: HeatmapRound, cursor: number, seconds: number) {
  const duration = round.duration ?? 0;
  const lastStart = Math.max(0, Math.ceil(duration) - 1);
  const start = Math.max(0, Math.min(cursor, lastStart));
  const end = Math.min(duration, start + seconds);
  const points = round.points.filter(
    (point) => point.seconds >= start && (point.seconds < end || (end === duration && point.seconds === end)),
  );
  return { start, end, lastStart, points };
}
