import type { TeamHeatmapFilter } from 'csdm/common/types/heatmap-filters';
import { HeatmapEvent } from 'csdm/common/types/heatmap-event';
import { buildRoundHeatmap, fetchHeatmapRounds } from 'csdm/node/database/heatmap/team-heatmap-timeline';
import type { HeatmapRoster, RoundHeatmapRequest } from 'csdm/common/types/team-heatmap-timeline';
import { assertNever } from 'csdm/common/assert-never';
import { fetchTeamKillsPoints } from 'csdm/node/database/heatmap/fetch-team-kills-points';
import { fetchTeamShotsPoints } from 'csdm/node/database/heatmap/fetch-team-shots-points';
import { fetchTeamGrenadePoints } from 'csdm/node/database/heatmap/fetch-team-grenade-points';
import { fetchTeamPositionsPoints } from 'csdm/node/database/heatmap/fetch-team-positions-points';
import { handleError } from '../../handle-error';

async function fetchEvents(filter: TeamHeatmapFilter, sampledRounds?: Set<string>) {
  switch (filter.event) {
    case HeatmapEvent.Kills:
    case HeatmapEvent.Deaths:
      return fetchTeamKillsPoints(filter);
    case HeatmapEvent.Shots:
      return fetchTeamShotsPoints(filter);
    case HeatmapEvent.Molotov:
    case HeatmapEvent.HeGrenade:
    case HeatmapEvent.Flashbang:
    case HeatmapEvent.Smoke:
    case HeatmapEvent.Decoy:
      return fetchTeamGrenadePoints(filter);
    case HeatmapEvent.Positions:
      return fetchTeamPositionsPoints(filter, sampledRounds);
    default:
      assertNever(filter.event, `Unsupported heatmap event: ${filter.event as string}`);
  }
}

export async function fetchTeamHeatmapTimelineHandler(
  filter: Omit<TeamHeatmapFilter, 'seasonMaps'> & { seasonMaps: HeatmapRoster[] },
) {
  try {
    if (!filter.seasonMaps.length) return [];
    const sampledRounds = filter.event === HeatmapEvent.Positions ? new Set<string>() : undefined;
    const [rounds, events] = await Promise.all([
      fetchHeatmapRounds(filter.seasonMaps.map((map) => map.checksum)),
      fetchEvents(filter, sampledRounds),
    ]);
    const byMatch = Map.groupBy(events, (point) => point.match_checksum);
    const clocks = Map.groupBy(rounds, (round) => round.checksum);
    return filter.seasonMaps.map((roster) =>
      buildRoundHeatmap(roster, clocks.get(roster.checksum) ?? [], byMatch.get(roster.checksum) ?? [], sampledRounds),
    );
  } catch (error) {
    handleError(error, 'Error while fetching team heatmap timeline');
  }
}

export async function fetchTeamHeatmapPointsHandler(filter: TeamHeatmapFilter) {
  try {
    return (await fetchEvents(filter)).map(({ x, y }) => ({ x, y }));
  } catch (error) {
    handleError(error, 'Error while fetching team heatmap points');
  }
}

export async function fetchRoundHeatmapHandler({
  checksum,
  mapName,
  teamName,
  steamIds,
  event,
  radarLevel,
  thresholdZ,
}: RoundHeatmapRequest) {
  try {
    const [data] = await fetchTeamHeatmapTimelineHandler({
      seasonMaps: [{ checksum, steamIds, teamName }],
      mapName,
      event,
      radarLevel,
      thresholdZ,
      teamName,
      demoTypes: [],
      gameModes: [],
      games: [],
      maxRounds: [],
      sides: [],
      sources: [],
      players: [],
      tagIds: [],
      startDate: undefined,
      endDate: undefined,
    });
    return data;
  } catch (error) {
    handleError(error, 'Error while fetching round heatmap');
  }
}
