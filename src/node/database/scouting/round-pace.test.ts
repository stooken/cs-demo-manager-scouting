import { describe, it, expect } from 'vite-plus/test';
import { TeamNumber } from 'csdm/common/types/counter-strike';
import { medianSample } from 'csdm/common/scouting-criteria';
import { resolveRoster } from './imported-seasons';
import { roundPace, roundSide } from './round-pace';

describe('season scouting fixtures', () => {
  const frame = (tick: number, a: string[], b: string[], carrier = 'five') => ({ tick, a, b, carrier, valid: true });
  const input = {
    map: 'de_nuke',
    checksum: 'test',
    round: 12,
    roster: ['one', 'two', 'three', 'four', 'five'],
    side: TeamNumber.T,
    start: 100,
    end: 700,
    rate: 10,
    plant: 450,
    hasPositions: true,
    hits: [{ tick: 220, attacker_steam_id: 'one', victim_steam_id: 'enemy' }],
    zones: {
      lastTick: 800,
      frames: [
        frame(0, [], []),
        frame(200, ['one', 'two'], []),
        frame(255, [], []),
        frame(400, [], ['five', 'three', 'four']),
      ],
    },
  };
  it('selects the same roster across halftime, including a stand-in and a renamed team', () => {
    const roster = resolveRoster(
      ['one', 'two'],
      ['one', 'two', 'sub', 'enemy'].map((steam_id) => ({
        steam_id,
        team_name: steam_id === 'enemy' ? 'Other' : 'Demo name',
      })),
    );
    expect(roster).toEqual({ teamName: 'Demo name', steamIds: ['one', 'two', 'sub'] });
    const r = { team_a_name: 'Other', team_b_name: 'Demo name', team_a_side: TeamNumber.T, team_b_side: TeamNumber.CT };
    expect(roundSide('Demo name', r)).toBe(TeamNumber.CT);
    expect(roundSide('Demo name', { ...r, team_a_side: TeamNumber.CT, team_b_side: TeamNumber.T })).toBe(TeamNumber.T);
    expect(
      resolveRoster(
        ['one', 'enemy'],
        [
          { steam_id: 'one', team_name: 'A' },
          { steam_id: 'enemy', team_name: 'B' },
        ],
      ),
    ).toBeUndefined();
  });
  it('flags contested A pressure followed by a B commit with the carrier', () => {
    expect(roundPace(input)).toMatchObject({
      contact: 12,
      entry: 10,
      plant: 35,
      eligible: true,
      flag: { from: 'A', to: 'B', pressureTick: 220, commitTime: 30 },
    });
  });
  it('leaves an uncontested rotation and a lone lurker unflagged', () => {
    expect(roundPace({ ...input, hits: [] })?.flag).toBeNull();
    expect(
      roundPace({
        ...input,
        zones: { ...input.zones, frames: input.zones.frames.map((f) => ({ ...f, a: f.a.slice(0, 1) })) },
      })?.flag,
    ).toBeNull();
  });
  it('keeps missing positions and CT rounds out of the fake denominator and nonplants out of plant pace', () => {
    const rows = [
      roundPace(input),
      roundPace({ ...input, plant: null }),
      roundPace({ ...input, hasPositions: false }),
      roundPace({ ...input, side: TeamNumber.CT }),
    ].filter((r) => r !== null);
    expect(rows.filter((r) => r.eligible)).toHaveLength(2);
    expect(medianSample(rows.map((r) => r.plant))).toEqual({ count: 2, median: 35 });
    expect(medianSample([null])).toEqual({ count: 0, median: null });
    expect(rows[2].exclusion).toBe('positions');
  });
});
