import { expect, it } from 'vite-plus/test';
import { EconomyType, GameMode, TeamNumber, RoundEndReason } from 'csdm/common/types/counter-strike';
import { buildRoundHeatmap } from './team-heatmap-timeline';

const regular = {
  checksum: '64-tick',
  number: 1,
  gameMode: GameMode.Competitive,
  teamA: 'Home',
  teamB: 'Away',
  economyA: EconomyType.Eco,
  economyB: EconomyType.Full,
  sideA: TeamNumber.T,
  sideB: TeamNumber.CT,
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
  const data = buildRoundHeatmap({ checksum: regular.checksum, teamName: 'Away' }, clocks, [
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

it('uses the fixture team on both sides and keeps ambiguous buys unknown', () => {
  const clocks = [
    regular,
    { ...regular, number: 2, sideB: TeamNumber.T, economyB: EconomyType.Pistol },
    { ...regular, number: 3, teamA: 'Away' },
  ];
  const data = buildRoundHeatmap({ checksum: regular.checksum, teamName: 'Away' }, clocks, []);
  expect(data.rounds.map((r) => [r.economy, r.side])).toEqual([
    [EconomyType.Full, TeamNumber.CT],
    [EconomyType.Pistol, TeamNumber.T],
    [null, null],
  ]);
});
