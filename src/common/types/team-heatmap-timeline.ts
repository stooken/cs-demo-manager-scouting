import type { Point } from './point';
import type { HeatmapEvent } from './heatmap-event';
import type { RadarLevel } from 'csdm/ui/maps/radar-level';

import type { EconomyType, TeamNumber } from './counter-strike';

export type HeatmapRoster = { checksum: string; steamIds: string[]; teamName: string };

export type RoundHeatmapRequest = HeatmapRoster & {
  mapName: string;
  event: HeatmapEvent;
  radarLevel: RadarLevel;
  thresholdZ: number | null;
};

export type HeatmapRound = {
  number: number;
  hasPositionSamples?: boolean;
  economy: EconomyType | null;
  side: TeamNumber | null;
  duration: number | null;
  plantSeconds: number | null;
  points: (Point & { seconds: number })[];
};

export type RoundHeatmapData = { clockSeconds: number; rounds: HeatmapRound[] };
