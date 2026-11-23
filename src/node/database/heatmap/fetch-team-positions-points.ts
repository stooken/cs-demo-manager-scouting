import { teamEventCondition } from './team-event-condition';
import { sql } from 'kysely';
import type { TeamHeatmapFilter } from 'csdm/common/types/heatmap-filters';
import type { RoundEventPoint } from './team-heatmap-timeline';
import { db } from 'csdm/node/database/database';
import { visitPositionSamplePoints } from 'csdm/node/database/player-position-samples/read-position-sample-points';

export async function fetchTeamPositionsPoints(filters: TeamHeatmapFilter): Promise<RoundEventPoint[]> {
  let query = db
    .selectFrom('player_position_samples')
    .select([
      'player_position_samples.match_checksum',
      'player_position_samples.round_number',
      'player_position_samples.ticks',
      'player_position_samples.x',
      'player_position_samples.y',
      'player_position_samples.z',
    ])
    .innerJoin('matches', 'matches.checksum', 'player_position_samples.match_checksum')
    .innerJoin('demos', 'demos.checksum', 'matches.checksum')
    .innerJoin('players', (join) => {
      return join
        .onRef('players.match_checksum', '=', 'player_position_samples.match_checksum')
        .onRef('players.steam_id', '=', 'player_position_samples.player_steam_id');
    })
    .where(
      teamEventCondition(
        filters,
        'players.team_name',
        'player_position_samples.player_steam_id',
        'player_position_samples.round_number',
      ),
    )
    .where('demos.map_name', '=', filters.mapName);

  if (filters.startDate !== undefined && filters.endDate !== undefined) {
    query = query.where(sql<boolean>`demos.date between ${filters.startDate} and ${filters.endDate}`);
  }

  if (filters.sources.length > 0) {
    query = query.where('demos.source', 'in', filters.sources);
  }

  if (filters.games.length > 0) {
    query = query.where('demos.game', 'in', filters.games);
  }

  if (filters.demoTypes.length > 0) {
    query = query.where('demos.type', 'in', filters.demoTypes);
  }

  if (filters.gameModes.length > 0) {
    query = query.where('matches.game_mode_str', 'in', filters.gameModes);
  }

  if (filters.maxRounds.length > 0) {
    query = query.where('matches.max_rounds', 'in', filters.maxRounds);
  }

  if (filters.sides.length > 0) {
    query = query.where('player_position_samples.side', 'in', filters.sides);
  }

  if (filters.players.length > 0) {
    query = query.where(
      'player_position_samples.player_steam_id',
      'in',
      filters.players.map((player) => player.steamId),
    );
  }

  if (filters.tagIds.length > 0) {
    query = query
      .innerJoin('checksum_tags', 'checksum_tags.checksum', 'matches.checksum')
      .where('checksum_tags.tag_id', 'in', filters.tagIds);
  }

  const rows = await query.execute();
  // Maps without a lower level have a threshold of 0, it means no threshold like in the other heatmap queries.
  const thresholdZ = filters.thresholdZ || null;

  const points: RoundEventPoint[] = [];
  for (const row of rows) {
    visitPositionSamplePoints(
      row,
      {
        startTick: 0,
        endTick: null,
        thresholdZ,
        radarLevel: filters.radarLevel,
      },
      ({ x, y }, tick) =>
        points.push({ x, y, tick, match_checksum: row.match_checksum, round_number: row.round_number }),
    );
  }
  return points;
}
