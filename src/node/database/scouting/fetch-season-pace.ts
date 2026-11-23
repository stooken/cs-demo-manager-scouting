import path from 'node:path';
import fs from 'fs-extra';
import { db } from 'csdm/node/database/database';
import { TeamNumber } from 'csdm/common/types/counter-strike';
import type { ImportedSeason, PaceRound } from 'csdm/common/types/imported-season';
import { fetchImportedSeasons, seasonFolder } from './imported-seasons';
import { roundPace, roundSide, type Zones } from './round-pace';

type Selection = Pick<ImportedSeason, 'teamId' | 'seasonId'>;
export async function fetchSeasonPace(selection: Selection): Promise<PaceRound[]> {
  const season = (await fetchImportedSeasons()).find(
    (s) => s.teamId === selection.teamId && s.seasonId === selection.seasonId,
  );
  const result: PaceRound[] = [];
  for (const m of season?.maps ?? []) {
    const { checksum } = m;
    const [rounds, hits, plants, positions] = await Promise.all([
      db
        .selectFrom('rounds')
        .innerJoin('demos', 'demos.checksum', 'rounds.match_checksum')
        .selectAll('rounds')
        .select('tickrate')
        .where('match_checksum', '=', checksum)
        .orderBy('number')
        .execute(),
      db
        .selectFrom('damages')
        .select(['round_number', 'tick', 'attacker_steam_id', 'victim_steam_id'])
        .where('match_checksum', '=', checksum)
        .where('health_damage', '>', 0)
        .where('attacker_side', 'in', [TeamNumber.T, TeamNumber.CT])
        .where('victim_side', 'in', [TeamNumber.T, TeamNumber.CT])
        .whereRef('attacker_side', '!=', 'victim_side')
        .orderBy('tick')
        .execute(),
      db
        .selectFrom('bombs_planted')
        .select(['round_number', 'tick'])
        .where('match_checksum', '=', checksum)
        .where('planter_steam_id', 'in', m.steamIds)
        .execute(),
      db
        .selectFrom('player_positions')
        .select('round_number')
        .distinct()
        .where('match_checksum', '=', checksum)
        .where('player_steam_id', 'in', m.steamIds)
        .execute(),
    ]);
    let zones: Zones | null = null;
    if (/^[0-9a-f]{1,16}$/i.test(checksum)) {
      const file = path.join(seasonFolder(), checksum + '.zones');
      if (await fs.pathExists(file)) zones = await fs.readJson(file);
    }
    for (const r of rounds) {
      const row = roundPace({
        map: m.mapName,
        checksum,
        round: r.number,
        roster: m.steamIds,
        start: r.freeze_time_end_tick,
        end: r.end_tick,
        rate: r.tickrate,
        side: roundSide(m.teamName, r),
        hits: hits.filter((h) => h.round_number === r.number),
        plant: plants.find((p) => p.round_number === r.number)?.tick ?? null,
        hasPositions: positions.some((p) => p.round_number === r.number),
        zones,
      });
      if (row) result.push(row);
    }
  }
  return result;
}
