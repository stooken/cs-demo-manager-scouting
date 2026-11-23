import { teamEventCondition } from './team-event-condition';
import { sql } from 'kysely';
import type { TeamHeatmapFilter } from 'csdm/common/types/heatmap-filters';
import type { RoundEventPoint } from './team-heatmap-timeline';
import { HeatmapEvent } from 'csdm/common/types/heatmap-event';
import { db } from 'csdm/node/database/database';
import { RadarLevel } from 'csdm/ui/maps/radar-level';

function buildQuery(filters: TeamHeatmapFilter) {
  const actor = filters.event === HeatmapEvent.Deaths ? 'victim' : 'killer';
  let query = db
    .selectFrom('kills')
    .innerJoin('matches', 'matches.checksum', 'kills.match_checksum')
    .innerJoin('demos', 'demos.checksum', 'matches.checksum')
    .where('demos.map_name', '=', filters.mapName);

  if (filters.thresholdZ) {
    query = query.where(`${actor}_z`, filters.radarLevel === RadarLevel.Upper ? '>=' : '<', filters.thresholdZ);
  }

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
    query = query.where(`${actor}_side`, 'in', filters.sides);
  }

  if (filters.players.length > 0) {
    query = query.where(
      `kills.${actor}_steam_id`,
      'in',
      filters.players.map((player) => player.steamId),
    );
  }

  if (filters.tagIds.length > 0) {
    query = query
      .innerJoin('checksum_tags', 'checksum_tags.checksum', 'matches.checksum')
      .where('checksum_tags.tag_id', 'in', filters.tagIds);
  }

  return query;
}

export async function fetchTeamKillsPoints(filters: TeamHeatmapFilter): Promise<RoundEventPoint[]> {
  switch (filters.event) {
    case HeatmapEvent.Kills: {
      const query = buildQuery(filters)
        .select(['kills.match_checksum', 'kills.round_number', 'kills.tick', 'killer_x as x', 'killer_y as y'])
        .where(teamEventCondition(filters, 'killer_team_name', 'killer_steam_id', 'kills.round_number'));

      const points = await query.execute();

      return points;
    }
    case HeatmapEvent.Deaths: {
      const query = buildQuery(filters)
        .select(['kills.match_checksum', 'kills.round_number', 'kills.tick', 'victim_x as x', 'victim_y as y'])
        .where(teamEventCondition(filters, 'victim_team_name', 'victim_steam_id', 'kills.round_number'));

      const points = await query.execute();

      return points;
    }
    default:
      throw new Error(`Unsupported kills points event: ${filters.event}`);
  }
}
