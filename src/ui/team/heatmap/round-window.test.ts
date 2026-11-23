import { expect, it } from 'vite-plus/test';
import { getRoundWindow } from './round-window';

it('shows only the recent history of this phase, including the plant and final ticks', () => {
  const round = {
    number: 7,
    economy: null,
    side: null,
    duration: 22.5,
    plantSeconds: 12.25,
    points: [0, 4, 5, 9, 9.1, 12.24, 12.25, 13, 22.5].map((seconds) => ({ x: 0, y: 0, seconds })),
  };
  const at = (cursor: number) => getRoundWindow(round, cursor, 5).points.map((p) => p.seconds);
  expect(at(0)).toEqual([0]);
  expect(at(9)).toEqual([5, 9]);
  expect(at(12.25)).toEqual([12.25]);
  expect(at(13)).toEqual([12.25, 13]);
  expect(at(99)).toEqual([22.5]);
});
