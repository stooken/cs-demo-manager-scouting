import fs from 'fs-extra';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db } from 'csdm/node/database/database';
import { getAppFolderPath } from 'csdm/node/filesystem/get-app-folder-path';
import type { ImportedSeason, SeasonPart } from 'csdm/common/types/imported-season';

export function seasonFolder() {
  return path.join(getAppFolderPath(), 'faceit-seasons');
}

export function resolveRoster(anchors: string[], players: { steam_id: string; team_name: string }[]) {
  const hits = players.filter((p) => anchors.includes(p.steam_id));
  const teams = new Set(hits.map((p) => p.team_name));
  if (teams.size !== 1 || new Set(hits.map((p) => p.steam_id)).size < 2) return;
  const teamName = hits[0].team_name;
  if (!teamName || new Set(players.map((p) => p.team_name)).size !== 2) return;
  const steamIds = players.filter((p) => p.team_name === teamName).map((p) => p.steam_id);
  if (players.some((p) => p.team_name !== teamName && steamIds.includes(p.steam_id))) return;
  return { teamName, steamIds };
}

export async function fetchImportedSeasons(): Promise<ImportedSeason[]> {
  const folder = seasonFolder();
  if (!(await fs.pathExists(folder))) return [];
  const files = (await fs.readdir(folder)).filter((f) => f.endsWith('.json'));
  const records: SeasonPart[] = await Promise.all(files.map((f) => fs.readJson(path.join(folder, f))));
  if (!records.length) return [];
  const checksums = [...new Set(records.map((r) => r.checksum))];
  const [players, maps] = await Promise.all([
    db
      .selectFrom('players')
      .select(['match_checksum', 'steam_id', 'team_name', 'name'])
      .where('match_checksum', 'in', checksums)
      .execute(),
    db
      .selectFrom('rounds')
      .innerJoin('demos', 'demos.checksum', 'rounds.match_checksum')
      .select(['match_checksum', 'map_name', 'demos.date'])
      .select((eb) => eb.fn.countAll<number>().as('rounds'))
      .where('match_checksum', 'in', checksums)
      .groupBy(['match_checksum', 'map_name', 'demos.date'])
      .execute(),
  ]);
  const seasons = new Map<string, ImportedSeason>();
  for (const [index, record] of records.entries()) {
    const { teamId, seasonId, teamName, seasonName, fixtureId, part, checksum } = record;
    const key = teamId + '/' + seasonId;
    const season = seasons.get(key) ?? { teamId, seasonId, teamName, seasonName, maps: [], review: [] };
    seasons.set(key, season);
    const map = maps.find((m) => m.match_checksum === checksum);
    const lineup = players.filter((p) => p.match_checksum === checksum);
    const decisionFile = path.join(folder, files[index] + '.review');
    const decision = (await fs.pathExists(decisionFile)) ? await fs.readJson(decisionFile) : null;
    const anchors = decision?.checksum === checksum ? decision.steamIds : record.steamIds;
    const roster = resolveRoster(anchors, lineup);
    if (!roster || !map) {
      const candidates = [...new Set(lineup.map((p) => p.team_name))].filter(Boolean).map((name) => {
        const side = lineup.filter((p) => p.team_name === name);
        return { name, players: side.map((p) => p.name), steamIds: side.map((p) => p.steam_id) };
      });
      season.review.push({ fixtureId, part, checksum, candidates: map && candidates.length === 2 ? candidates : [] });
    } else if (!season.maps.some((m) => m.checksum === checksum))
      season.maps.push({
        fixtureId,
        part,
        checksum,
        mapName: map.map_name,
        rounds: Number(map.rounds),
        opponent: lineup.find((p) => p.team_name !== roster.teamName)?.team_name ?? '',
        date: map.date.toISOString(),
        ...roster,
      });
  }
  return [...seasons.values()];
}
export type SeasonReview = Pick<SeasonPart, 'teamId' | 'seasonId' | 'checksum' | 'fixtureId' | 'part'> & {
  name: string;
};
export async function confirmSeasonRoster(input: SeasonReview) {
  const season = (await fetchImportedSeasons()).find((s) => s.teamId === input.teamId && s.seasonId === input.seasonId);
  const item = season?.review.find(
    (m) => m.fixtureId === input.fixtureId && m.part === input.part && m.checksum === input.checksum,
  );
  const choice = item?.candidates.find((c) => c.name === input.name);
  if (!item || !season || !choice || choice.steamIds.length < 2)
    throw new Error('Refresh the season before reviewing this lineup.');
  const file = path.join(
    seasonFolder(),
    [season.teamId, season.seasonId, item.fixtureId, item.part].join('_') + '.json.review',
  );
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    await fs.writeJson(temporary, { checksum: item.checksum, steamIds: choice.steamIds });
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
