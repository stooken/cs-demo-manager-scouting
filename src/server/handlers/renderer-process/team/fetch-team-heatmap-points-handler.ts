import type { TeamHeatmapFilter } from 'csdm/common/types/heatmap-filters';
import { HeatmapEvent } from 'csdm/common/types/heatmap-event';
import {
  buildRoundHeatmap,
  fetchHeatmapRounds,
  fetchTeamHeatmapTimeline,
} from 'csdm/node/database/heatmap/team-heatmap-timeline';
import type { RoundHeatmapRequest } from 'csdm/common/types/team-heatmap-timeline';
import { assertNever } from 'csdm/common/assert-never';
import { fetchTeamKillsPoints } from 'csdm/node/database/heatmap/fetch-team-kills-points';
import { fetchTeamShotsPoints } from 'csdm/node/database/heatmap/fetch-team-shots-points';
import { fetchTeamGrenadePoints } from 'csdm/node/database/heatmap/fetch-team-grenade-points';
import { fetchTeamPositionsPoints } from 'csdm/node/database/heatmap/fetch-team-positions-points';
import { handleError } from '../../handle-error';

async function fetchEvents(filter: TeamHeatmapFilter) {
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
      return fetchTeamPositionsPoints(filter);
    default:
      assertNever(filter.event, `Unsupported heatmap event: ${filter.event as string}`);
  }
}

export async function fetchTeamHeatmapTimelineHandler(filter: TeamHeatmapFilter) {
  try {
    return await fetchTeamHeatmapTimeline(await fetchEvents(filter), filter.windowSeconds);
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
  steamIds,
  event,
  radarLevel,
  thresholdZ,
}: RoundHeatmapRequest) {
  try {
    const [rounds, events] = await Promise.all([
      fetchHeatmapRounds([checksum]),
      fetchEvents({
        seasonMaps: [{ checksum, steamIds }],
        mapName,
        event,
        radarLevel,
        thresholdZ,
        teamName: '',
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
      }),
    ]);
    return buildRoundHeatmap(checksum, rounds, events);
  } catch (error) {
    handleError(error, 'Error while fetching round heatmap');
  }
}
