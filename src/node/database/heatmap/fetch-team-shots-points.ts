import { teamEventCondition } from './team-event-condition';
import { sql } from 'kysely';
import type { RoundEventPoint } from './team-heatmap-timeline';
import type { TeamHeatmapFilter } from 'csdm/common/types/heatmap-filters';
import { db } from 'csdm/node/database/database';

export async function fetchTeamShotsPoints(filters: TeamHeatmapFilter): Promise<RoundEventPoint[]> {
  let query = db
    .selectFrom('shots')
    .select(['shots.match_checksum', 'shots.round_number', 'shots.tick', 'x', 'y'])
    .innerJoin('matches', 'matches.checksum', 'shots.match_checksum')
    .innerJoin('demos', 'demos.checksum', 'matches.checksum')
    .where('demos.map_name', '=', filters.mapName)
    .where(teamEventCondition(filters, 'player_team_name', 'shots.player_steam_id', 'shots.round_number'));

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
    query = query.where('max_rounds', 'in', filters.maxRounds);
  }

  if (filters.sides.length > 0) {
    query = query.where('player_side', 'in', filters.sides);
  }

  if (filters.players.length > 0) {
    query = query.where(
      'player_steam_id',
      'in',
      filters.players.map((player) => player.steamId),
    );
  }

  if (filters.tagIds.length > 0) {
    query = query
      .innerJoin('checksum_tags', 'checksum_tags.checksum', 'matches.checksum')
      .where('checksum_tags.tag_id', 'in', filters.tagIds);
  }

  const points = await query.execute();

  return points;
}
