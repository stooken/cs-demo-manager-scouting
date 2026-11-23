import type { Point } from 'csdm/common/types/point';
import { createDataView } from 'csdm/node/database/create-data-view';
import { RadarLevel } from 'csdm/ui/maps/radar-level';
import type { PlayerPositionSampleTable } from './player-position-sample-table';

type PackedSamples = Pick<PlayerPositionSampleTable, 'ticks' | 'x' | 'y' | 'z'>;

type Options = {
  startTick: number; // inclusive
  endTick: number | null; // inclusive, null => no upper bound
  thresholdZ: number | null;
  radarLevel: RadarLevel;
};

// Reads the heatmap points from the sampled positions of one player during one round.
export function readPositionSamplePoints(packed: PackedSamples, options: Options): Point[] {
  const points: Point[] = [];
  visitPositionSamplePoints(packed, options, (point) => points.push(point));
  return points;
}

export function visitPositionSamplePoints(
  packed: PackedSamples,
  options: Options,
  visit: (point: Point, tick: number) => void,
) {
  const { startTick, endTick, thresholdZ, radarLevel } = options;
  const ticks = createDataView(packed.ticks);
  const x = createDataView(packed.x);
  const y = createDataView(packed.y);
  const z = createDataView(packed.z);
  const count = packed.ticks.byteLength / 4;

  for (let index = 0; index < count; index++) {
    const offset = index * 4;
    const tick = ticks.getInt32(offset);
    if (tick < startTick) {
      continue;
    }
    if (endTick !== null && tick > endTick) {
      break;
    }
    if (thresholdZ !== null) {
      const positionZ = z.getFloat32(offset);
      const isVisible = radarLevel === RadarLevel.Upper ? positionZ >= thresholdZ : positionZ < thresholdZ;
      if (!isVisible) {
        continue;
      }
    }

    visit(
      {
        x: x.getFloat32(offset),
        y: y.getFloat32(offset),
      },
      tick,
    );
  }
}
