import { expect, it } from 'vite-plus/test';
import { getRoundWindow } from './round-window';

it('slides by one second independently of width, with a closed final tick only at round end', () => {
  const round = {
    number: 7,
    duration: 22.5,
    plantSeconds: 12,
    points: [9.99, 10, 14.99, 15, 20, 22.5].map((seconds) => ({ x: 0, y: 0, seconds })),
  };
  expect(getRoundWindow(round, 10, 5).points.map((p) => p.seconds)).toEqual([10, 14.99]);
  expect(getRoundWindow(round, 11, 10).points.map((p) => p.seconds)).toEqual([14.99, 15, 20]);
  expect(getRoundWindow(round, 30, 1)).toMatchObject({ start: 22, end: 22.5, points: [{ seconds: 22.5 }] });
});
