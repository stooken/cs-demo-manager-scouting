import { teamEventCondition } from './team-event-condition';
import { RadarLevel } from 'csdm/ui/maps/radar-level';
import { sql } from 'kysely';
import { GrenadeName } from 'csdm/common/types/counter-strike';
import type { RoundEventPoint } from './team-heatmap-timeline';
import type { TeamHeatmapFilter } from 'csdm/common/types/heatmap-filters';
import { db } from 'csdm/node/database/database';
import { HeatmapEvent } from 'csdm/common/types/heatmap-event';

export async function fetchTeamGrenadePoints(filters: TeamHeatmapFilter): Promise<RoundEventPoint[]> {
  const grenadeNames: GrenadeName[] = [];
  switch (filters.event) {
    case HeatmapEvent.Smoke:
      grenadeNames.push(GrenadeName.Smoke);
      break;
    case HeatmapEvent.Decoy:
      grenadeNames.push(GrenadeName.Decoy);
      break;
    case HeatmapEvent.Flashbang:
      grenadeNames.push(GrenadeName.Flashbang);
      break;
    case HeatmapEvent.HeGrenade:
      grenadeNames.push(GrenadeName.HE);
      break;
    case HeatmapEvent.Molotov:
      grenadeNames.push(GrenadeName.Molotov, GrenadeName.Incendiary);
      break;
    default:
      throw new Error(`Unsupported grenade event: ${filters.event}`);
  }

  let query = db
    .selectFrom('grenade_projectiles_destroy')
    .select([
      'grenade_projectiles_destroy.match_checksum',
      'grenade_projectiles_destroy.round_number',
      'grenade_projectiles_destroy.tick',
      'x',
      'y',
    ])
    .innerJoin('matches', 'matches.checksum', 'grenade_projectiles_destroy.match_checksum')
    .innerJoin('demos', 'demos.checksum', 'matches.checksum')
    .where('demos.map_name', '=', filters.mapName)
    .where(
      teamEventCondition(filters, 'thrower_team_name', 'thrower_steam_id', 'grenade_projectiles_destroy.round_number'),
    )
    .where('grenade_name', 'in', grenadeNames);

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
    query = query.where('thrower_side', 'in', filters.sides);
  }

  if (filters.players.length > 0) {
    query = query.where(
      'thrower_steam_id',
      'in',
      filters.players.map((player) => player.steamId),
    );
  }

  if (filters.tagIds.length > 0) {
    query = query
      .innerJoin('checksum_tags', 'checksum_tags.checksum', 'matches.checksum')
      .where('checksum_tags.tag_id', 'in', filters.tagIds);
  }

  if (filters.thresholdZ) {
    query = query.where('z', filters.radarLevel === RadarLevel.Upper ? '>=' : '<', filters.thresholdZ);
  }
  const points = query.execute();

  return points;
}
