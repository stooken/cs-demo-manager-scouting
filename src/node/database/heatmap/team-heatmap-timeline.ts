import type { Point } from 'csdm/common/types/point';
import type {
  HeatmapFrame,
  HeatmapRound,
  RoundHeatmapData,
  TeamHeatmapTimeline,
} from 'csdm/common/types/team-heatmap-timeline';
import type { RoundEndReason } from 'csdm/common/types/counter-strike';
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
};

export function buildTeamHeatmapTimeline(
  events: RoundEventPoint[],
  rounds: RoundClock[],
  windowSeconds = 10,
): TeamHeatmapTimeline {
  if (!Number.isSafeInteger(windowSeconds) || windowSeconds < 1) throw new RangeError('Invalid heatmap window');
  const byMatch = new Map<string, Map<number, RoundClock>>();
  let maxPostPlant = 0;
  let hasPlant = false;
  for (const round of rounds) {
    if (
      round.tickrate <= 0 ||
      round.number < 1 ||
      round.freezeTimeEndTick <= 0 ||
      round.endTick < round.freezeTimeEndTick
    )
      continue;
    let match = byMatch.get(round.checksum);
    if (!match) {
      match = new Map();
      byMatch.set(round.checksum, match);
    }
    match.set(round.number, round);
    if (round.plantTick !== null && round.plantTick >= round.freezeTimeEndTick && round.plantTick <= round.endTick) {
      hasPlant = true;
      maxPostPlant = Math.max(maxPostPlant, (round.endTick - round.plantTick) / round.tickrate);
    }
  }

  const clocks = new Map<string, number>();
  let maxClock = 0;
  for (const [checksum, match] of byMatch) {
    const matchRounds = [...match.values()];
    const { tickrate, gameMode } = matchRounds[0];
    const duration = getRoundDurationSeconds(matchRounds, tickrate, gameMode);
    clocks.set(checksum, duration);
    maxClock = Math.max(maxClock, duration);
  }
  const frames: HeatmapFrame[] = [];
  for (let start = maxClock; start > 0; start -= windowSeconds) {
    frames.push({ phase: 'round', startSeconds: start, endSeconds: Math.max(0, start - windowSeconds), points: [] });
  }
  const prePlantFrames = frames.length;
  if (hasPlant) {
    for (let start = 0; start < Math.max(1, maxPostPlant); start += windowSeconds) {
      frames.push({
        phase: 'post-plant',
        startSeconds: start,
        endSeconds: Math.min(start + windowSeconds, Math.ceil(maxPostPlant)),
        points: [],
      });
    }
  }

  const outsideClock: Point[] = [];
  for (const { x, y, match_checksum, round_number, tick } of events) {
    const round = byMatch.get(match_checksum)?.get(round_number);
    const clock = clocks.get(match_checksum);
    if (!round || clock === undefined || tick < round.freezeTimeEndTick || tick > round.endTick) {
      outsideClock.push({ x, y });
      continue;
    }
    if (round.plantTick !== null && round.plantTick >= round.freezeTimeEndTick && tick >= round.plantTick) {
      const elapsed = (tick - round.plantTick) / round.tickrate;
      const index = prePlantFrames + Math.floor(elapsed / windowSeconds);
      frames[Math.min(index, frames.length - 1)].points.push({ x, y });
    } else {
      const elapsed = (tick - round.freezeTimeEndTick) / round.tickrate;
      const index = Math.floor((maxClock - clock + elapsed) / windowSeconds);
      frames[Math.min(index, prePlantFrames - 1)].points.push({ x, y });
    }
  }
  return { frames, outsideClock };
}

export async function fetchHeatmapRounds(checksums: string[]) {
  return db
    .selectFrom('rounds')
    .innerJoin('demos', 'demos.checksum', 'rounds.match_checksum')
    .innerJoin('matches', 'matches.checksum', 'rounds.match_checksum')
    .select([
      'rounds.match_checksum as checksum',
      'rounds.number',
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

export async function fetchTeamHeatmapTimeline(events: RoundEventPoint[], windowSeconds?: number) {
  const checksums = [...new Set(events.map((event) => event.match_checksum))];
  if (checksums.length === 0) return { frames: [], outsideClock: [] };
  return buildTeamHeatmapTimeline(events, await fetchHeatmapRounds(checksums), windowSeconds);
}

export function buildRoundHeatmap(checksum: string, clocks: RoundClock[], events: RoundEventPoint[]): RoundHeatmapData {
  const byNumber = new Map<number, { clock: RoundClock; round: HeatmapRound }>();
  const matchRounds = clocks.filter((r) => r.checksum === checksum && r.number > 0);
  for (const clock of matchRounds) {
    const { number, tickrate, freezeTimeEndTick, endTick, plantTick } = clock;
    const valid = tickrate > 0 && freezeTimeEndTick > 0 && endTick >= freezeTimeEndTick;
    byNumber.set(number, {
      clock,
      round: {
        number,
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
