import { expect, it } from 'vite-plus/test';
import { GameMode, RoundEndReason } from 'csdm/common/types/counter-strike';
import { buildRoundHeatmap, buildTeamHeatmapTimeline } from './team-heatmap-timeline';

const regular = {
  checksum: '64-tick',
  number: 1,
  gameMode: GameMode.Competitive,
  tickrate: 64,
  freezeTimeEndTick: 640,
  endTick: 3840,
  endReason: RoundEndReason.TargetBombed,
  plantTick: 1920,
};
function point(tick: number, checksum = regular.checksum) {
  return { tick, x: tick, y: 0, match_checksum: checksum, round_number: 1 };
}

it('isolates one map and retains real round numbers even when a round has no events', () => {
  const clocks = [
    regular,
    { ...regular, number: 4, freezeTimeEndTick: 4000, endTick: 4704, plantTick: null },
    { ...regular, number: 7 },
    { ...regular, number: 8, tickrate: 0 },
  ];
  const data = buildRoundHeatmap(regular.checksum, clocks, [
    point(639),
    point(1280),
    point(3841),
    point(1280, 'another-map'),
    { ...point(4640), round_number: 4 },
    { ...point(4100), round_number: 3 },
  ]);
  expect(data.rounds.map((r) => [r.number, r.duration, r.points.map((p) => p.seconds)])).toEqual([
    [1, 50, [10]],
    [4, 11, [10]],
    [7, 50, []],
    [8, null, []],
  ]);
  expect(data.rounds[0].plantSeconds).toBe(20);
});

it('uses the chosen window size for the aggregate clock', () => {
  const { frames } = buildTeamHeatmapTimeline([point(640), point(960)], [regular], 5);
  expect(frames.slice(0, 2).map((f) => [f.startSeconds, f.endSeconds, f.points.length])).toEqual([
    [115, 110, 1],
    [110, 105, 1],
  ]);
  expect(() => buildTeamHeatmapTimeline([], [], 0)).toThrow();
});

it('assigns boundary ticks exactly once and only times events between freeze end and the win', () => {
  const ticks = [639, 640, 1279, 1280, 1919, 1920, 2559, 2560, 3840, 3841];
  const { frames, outsideClock } = buildTeamHeatmapTimeline(
    ticks.map((tick) => point(tick)),
    [regular],
  );
  expect(frames[0]).toMatchObject({ phase: 'round', startSeconds: 115, endSeconds: 105 });
  expect(frames[0].points.map((p) => p.x)).toEqual([640, 1279]);
  expect(frames[1].points.map((p) => p.x)).toEqual([1280, 1919]);
  const postPlant = frames.filter((frame) => frame.phase === 'post-plant');
  expect(postPlant.map((f) => f.points.map((p) => p.x))).toEqual([[1920, 2559], [2560], [3840]]);
  expect(outsideClock.map((p) => p.x)).toEqual([639, 3841]);
  expect(outsideClock.length + frames.flatMap((f) => f.points).length).toBe(ticks.length);
});

it('aligns equal countdowns across tickrates and clock lengths, including a clock inferred from timeout', () => {
  const longer = {
    ...regular,
    checksum: '128-tick',
    tickrate: 128,
    freezeTimeEndTick: 128,
    endTick: 128 + 125 * 128,
    endReason: RoundEndReason.TargetSaved,
    plantTick: null,
  };
  const { frames } = buildTeamHeatmapTimeline([point(640), point(128 + 10 * 128, longer.checksum)], [regular, longer]);
  expect(frames[0].startSeconds).toBe(125);
  expect(frames[1].startSeconds).toBe(115);
  expect(frames[1].points).toHaveLength(2);
});

it('keeps missing timing in the whole-round view and omits the post-plant phase for unplanted rounds', () => {
  const { frames, outsideClock } = buildTeamHeatmapTimeline(
    [point(800), point(800, 'missing')],
    [{ ...regular, plantTick: null }],
  );
  expect(frames.every((frame) => frame.phase === 'round')).toBe(true);
  expect(outsideClock).toHaveLength(1);
  expect(buildTeamHeatmapTimeline([point(800)], [{ ...regular, tickrate: 0 }])).toEqual({
    frames: [],
    outsideClock: [{ x: 800, y: 0 }],
  });
});
