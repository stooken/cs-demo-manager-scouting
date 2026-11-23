import { expect, it } from 'vite-plus/test';
import { EconomyType, TeamNumber } from 'csdm/common/types/counter-strike';
import { compareRounds, getComparisonWindows } from './round-comparison';

const round = {
  number: 1,
  economy: EconomyType.Eco,
  side: TeamNumber.T,
  duration: 45,
  plantSeconds: 20.25,
  points: [0, 10, 20, 20.25, 25, 30.25, 45].map((seconds) => ({ x: -1, y: 250, seconds })),
};
const matches = [
  {
    clockSeconds: 115,
    rounds: [
      round,
      { ...round, number: 2, plantSeconds: null, duration: 10, points: [] },
      { ...round, number: 3, side: TeamNumber.CT, economy: EconomyType.Full },
    ],
  },
];
it('includes silent eligible rounds, counts a cell once per round and keeps side and buy independent', () => {
  expect(compareRounds(matches, EconomyType.Eco, [TeamNumber.T])).toMatchObject({
    eligible: 2,
    observed: 1,
    matching: 2,
    coverage: { cells: [{ x: -128, y: 128, rounds: 1 }], eligible: 2 },
  });
  expect(compareRounds(matches, EconomyType.Full, [TeamNumber.T]).matching).toBe(0);
});
it('compares the same remaining clock across matches and ignores rounds that ended early', () => {
  const other = {
    clockSeconds: 125,
    rounds: [{ ...round, plantSeconds: null, points: [{ x: 7, y: 9, seconds: 20 }] }],
  };
  const window = { phase: 'round' as const, start: 105, end: 95 };
  expect(compareRounds([...matches, other], EconomyType.Eco, [], window)).toMatchObject({
    eligible: 3,
    observed: 2,
    points: [{ seconds: 10 }, { seconds: 20 }],
  });
  expect(compareRounds(matches, EconomyType.Eco, [], { phase: 'round', start: 95, end: 85 })).toMatchObject({
    eligible: 1,
    points: [{ seconds: 20 }],
  });
});
it('uses each actual plant as zero and assigns window boundaries once including a final tick', () => {
  const other = { ...round, number: 2, plantSeconds: 35, duration: 45, points: [{ x: 3, y: 8, seconds: 45 }] };
  const data = [{ clockSeconds: 115, rounds: [...matches[0].rounds, other] }];
  const windows = getComparisonWindows(data, 10);
  const post = windows.filter((w) => w.phase === 'post-plant');
  expect(compareRounds(data, EconomyType.Eco, [], post[0])).toMatchObject({
    matching: 3,
    eligible: 2,
    points: [{ seconds: 20.25 }, { seconds: 25 }],
  });
  expect(compareRounds(data, EconomyType.Eco, [], post[1])).toMatchObject({
    eligible: 2,
    points: [{ seconds: 30.25 }, { seconds: 45 }],
  });
  const allPoints = windows.flatMap((w) => compareRounds(data, 'all', [], w).points);
  expect(allPoints.length).toBe(compareRounds(data, 'all', []).points.length);
  expect(
    getComparisonWindows([{ clockSeconds: 115, rounds: [{ ...round, plantSeconds: null }] }], 5).every(
      (w) => w.phase === 'round',
    ),
  ).toBe(true);
  expect(getComparisonWindows([], 0)).toEqual([]);
});

it('excludes rounds without position recordings while retaining recorded rounds with no activity on this floor', () => {
  const data = [
    {
      clockSeconds: 115,
      rounds: [
        { ...round, hasPositionSamples: false, points: [] },
        { ...round, hasPositionSamples: true, points: [] },
      ],
    },
  ];
  expect(compareRounds(data, 'all', [])).toMatchObject({ matching: 2, eligible: 1, missingSamples: 1, observed: 0 });
});

it('keeps timeout tick rounding in the last countdown window', () => {
  const timeout = { ...round, plantSeconds: null, duration: 115.03125, points: [{ x: 0, y: 0, seconds: 115.03125 }] };
  expect(
    compareRounds([{ clockSeconds: 115, rounds: [timeout] }], 'all', [], { phase: 'round', start: 5, end: 0 }).points,
  ).toEqual(timeout.points);
});
