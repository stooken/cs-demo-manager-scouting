import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { Kysely, SqliteDialect } from 'kysely';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vite-plus/test';
import { HeatmapEvent } from 'csdm/common/types/heatmap-event';
import type { TeamHeatmapFilter } from 'csdm/common/types/heatmap-filters';
import { GrenadeName, TeamNumber } from 'csdm/common/types/counter-strike';
import { RadarLevel } from 'csdm/ui/maps/radar-level';
import { fetchTeamKillsPoints } from './fetch-team-kills-points';
import { fetchTeamGrenadePoints } from './fetch-team-grenade-points';

const connection = new DatabaseSync(':memory:');
const database = new Kysely({
  dialect: new SqliteDialect({
    database: {
      close: () => connection.close(),
      prepare(sql) {
        const stmt = connection.prepare(sql);
        return {
          reader: true,
          all: (args) => stmt.all(...(args as SQLInputValue[])),
          run: () => {
            throw Error('read only');
          },
          iterate: () => {
            throw Error('read only');
          },
        };
      },
    },
  }),
});
vi.mock('csdm/node/database/database', () => ({
  get db() {
    return database;
  },
}));
const filter: TeamHeatmapFilter = {
  mapName: 'de_nuke',
  teamName: 'renamed',
  event: HeatmapEvent.Deaths,
  seasonMaps: [{ checksum: 'fixture', steamIds: ['sub'] }],
  radarLevel: RadarLevel.Lower,
  thresholdZ: -300,
  sides: [TeamNumber.CT],
  players: [{ steamId: 'sub', name: 'stand-in' }],
  games: [],
  demoTypes: [],
  maxRounds: [],
  gameModes: [],
  sources: [],
  tagIds: [],
  startDate: undefined,
  endDate: undefined,
};
describe('known Nuke round fixture', () => {
  beforeAll(() => {
    connection.exec(`create table matches(checksum text); create table demos(checksum text,map_name text);
      create table rounds(match_checksum text,number); insert into rounds values ('fixture',12),('pickup',12);
      create table kills(match_checksum text,round_number,killer_x,killer_y,killer_z,killer_side,killer_steam_id,killer_team_name,victim_x,victim_y,victim_z,victim_side,victim_steam_id,victim_team_name);
      create table grenade_projectiles_destroy(match_checksum text,round_number,x,y,z,thrower_side,thrower_steam_id,thrower_team_name,grenade_name);
      insert into matches values ('fixture'),('pickup'); insert into demos values ('fixture','de_nuke'),('pickup','de_nuke');
      insert into kills values ('fixture',12,10,20,20,2,'enemy','X',90,80,-410,3,'sub','Y');
      insert into kills values ('fixture',0,1,2,20,2,'enemy','X',10,12,-420,3,'sub','Y');
      insert into kills select 'pickup',12,10,20,20,2,'enemy','X',90,80,-410,3,'sub','Y';
      alter table kills add column tick integer default 1420;
      alter table grenade_projectiles_destroy add column tick integer default 1440;`);
    connection
      .prepare(
        'insert into grenade_projectiles_destroy(match_checksum,round_number,x,y,z,thrower_side,thrower_steam_id,thrower_team_name,grenade_name) values (?,12,?,?,?,?,?,?,?)',
      )
      .run('fixture', 15, 25, -450, 3, 'sub', 'Y', GrenadeName.Smoke);
  });
  afterAll(() => database.destroy());
  it('uses the lower-floor victim for identity, position, side and player filters', async () => {
    expect(await fetchTeamKillsPoints(filter)).toEqual([
      { x: 90, y: 80, match_checksum: 'fixture', round_number: 12, tick: 1420 },
    ]);
    expect(await fetchTeamKillsPoints({ ...filter, radarLevel: RadarLevel.Upper })).toEqual([]);
    expect(await fetchTeamKillsPoints({ ...filter, players: [{ steamId: 'enemy', name: 'enemy' }] })).toEqual([]);
    expect(await fetchTeamKillsPoints({ ...filter, sides: [TeamNumber.T] })).toEqual([]);
  });
  it('selects the opposing upper-floor killer and the scoped lower-floor smoke', async () => {
    expect(
      await fetchTeamKillsPoints({
        ...filter,
        event: HeatmapEvent.Kills,
        radarLevel: RadarLevel.Upper,
        seasonMaps: [{ checksum: 'fixture', steamIds: ['enemy'] }],
        sides: [TeamNumber.T],
        players: [],
      }),
    ).toEqual([{ x: 10, y: 20, match_checksum: 'fixture', round_number: 12, tick: 1420 }]);
    expect(await fetchTeamGrenadePoints({ ...filter, event: HeatmapEvent.Smoke })).toEqual([
      { x: 15, y: 25, match_checksum: 'fixture', round_number: 12, tick: 1440 },
    ]);
    expect(
      await fetchTeamGrenadePoints({ ...filter, event: HeatmapEvent.Smoke, radarLevel: RadarLevel.Upper }),
    ).toEqual([]);
  });
});
