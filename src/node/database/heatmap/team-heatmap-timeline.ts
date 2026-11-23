import type { Point } from 'csdm/common/types/point';
import type { HeatmapRoster, HeatmapRound, RoundHeatmapData } from 'csdm/common/types/team-heatmap-timeline';
import type { EconomyType, TeamNumber, RoundEndReason } from 'csdm/common/types/counter-strike';
import { db } from 'csdm/node/database/database';
import { getRoundDurationSeconds } from 'csdm/node/database/match/get-round-duration-seconds';

export type RoundEventPoint = Point & { match_checksum: string; round_number: number; tick: number };

type RoundClock = {
  checksum: string;
  number: number;
  freezeTimeEndTick: number;
  endTick: number;
  endReason: RoundEndReason;
  plantTick: number | null;
  tickrate: number;
  gameMode: string;
  teamA: string;
  teamB: string;
  economyA: EconomyType;
  economyB: EconomyType;
  sideA: TeamNumber;
  sideB: TeamNumber;
};

export async function fetchHeatmapRounds(checksums: string[]) {
  return db
    .selectFrom('rounds')
    .innerJoin('demos', 'demos.checksum', 'rounds.match_checksum')
    .innerJoin('matches', 'matches.checksum', 'rounds.match_checksum')
    .select([
      'rounds.match_checksum as checksum',
      'rounds.number',
      'rounds.team_a_name as teamA',
      'rounds.team_b_name as teamB',
      'rounds.team_a_economy_type as economyA',
      'rounds.team_b_economy_type as economyB',
      'rounds.team_a_side as sideA',
      'rounds.team_b_side as sideB',
      'rounds.freeze_time_end_tick as freezeTimeEndTick',
      'rounds.end_tick as endTick',
      'rounds.end_reason as endReason',
      'demos.tickrate',
      'matches.game_mode_str as gameMode',
    ])
    .select((eb) =>
      eb
        .selectFrom('bombs_planted')
        .select((eb) => eb.fn.min('tick').as('tick'))
        .whereRef('bombs_planted.match_checksum', '=', 'rounds.match_checksum')
        .whereRef('bombs_planted.round_number', '=', 'rounds.number')
        .as('plantTick'),
    )
    .where('rounds.match_checksum', 'in', checksums)
    .orderBy('rounds.number')
    .execute();
}

export function buildRoundHeatmap(
  { checksum, teamName }: Pick<HeatmapRoster, 'checksum' | 'teamName'>,
  clocks: RoundClock[],
  events: RoundEventPoint[],
  sampledRounds?: Set<string>,
): RoundHeatmapData {
  const byNumber = new Map<number, { clock: RoundClock; round: HeatmapRound }>();
  const matchRounds = clocks.filter((r) => r.checksum === checksum && r.number > 0);
  for (const clock of matchRounds) {
    const { number, tickrate, freezeTimeEndTick, endTick, plantTick } = clock;
    const valid = tickrate > 0 && freezeTimeEndTick > 0 && endTick >= freezeTimeEndTick;
    const isA = Boolean(teamName) && teamName === clock.teamA;
    const isB = Boolean(teamName) && teamName === clock.teamB;
    byNumber.set(number, {
      clock,
      round: {
        number,
        hasPositionSamples: sampledRounds?.has(checksum + '/' + number),
        economy: isA === isB ? null : isA ? clock.economyA : clock.economyB,
        side: isA === isB ? null : isA ? clock.sideA : clock.sideB,
        duration: valid ? (endTick - freezeTimeEndTick) / tickrate : null,
        plantSeconds:
          valid && plantTick !== null && plantTick >= freezeTimeEndTick && plantTick <= endTick
            ? (plantTick - freezeTimeEndTick) / tickrate
            : null,
        points: [],
      },
    });
  }
  for (const event of events) {
    const item = byNumber.get(event.round_number);
    if (event.match_checksum !== checksum || !item || item.round.duration === null) continue;
    const { freezeTimeEndTick, endTick, tickrate } = item.clock;
    if (event.tick >= freezeTimeEndTick && event.tick <= endTick) {
      item.round.points.push({ x: event.x, y: event.y, seconds: (event.tick - freezeTimeEndTick) / tickrate });
    }
  }
  return {
    clockSeconds: getRoundDurationSeconds(matchRounds, matchRounds[0]?.tickrate ?? 0, matchRounds[0]?.gameMode ?? ''),
    rounds: Array.from(byNumber.values(), ({ round }) => round),
  };
}
