import type { Point } from './point';
import type { HeatmapEvent } from './heatmap-event';
import type { RadarLevel } from 'csdm/ui/maps/radar-level';

export type RoundHeatmapRequest = {
  checksum: string;
  mapName: string;
  steamIds: string[];
  event: HeatmapEvent;
  radarLevel: RadarLevel;
  thresholdZ: number | null;
};

export type HeatmapRound = {
  number: number;
  duration: number | null;
  plantSeconds: number | null;
  points: (Point & { seconds: number })[];
};

export type RoundHeatmapData = { clockSeconds: number; rounds: HeatmapRound[] };

export type HeatmapFrame = {
  phase: 'round' | 'post-plant';
  startSeconds: number;
  endSeconds: number;
  points: Point[];
};

export type TeamHeatmapTimeline = {
  frames: HeatmapFrame[];
  // Warmup, freeze time, after the win, or missing round timing. Keep these in the whole-round view.
  outsideClock: Point[];
};
