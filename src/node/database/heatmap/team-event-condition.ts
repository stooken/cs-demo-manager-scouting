import { sql } from 'kysely';
import type { TeamHeatmapFilter } from 'csdm/common/types/heatmap-filters';

// Keep the roster paired with its match. A substitute may play for a different team in another fixture.
export function teamEventCondition(
  filter: TeamHeatmapFilter,
  nameColumn: string,
  steamColumn: string,
  roundColumn: string,
) {
  if (!filter.seasonMaps) return sql<boolean>`${sql.ref(nameColumn)} = ${filter.teamName}`;
  const predicates = filter.seasonMaps
    .filter((m) => m.steamIds.length)
    .map((m) => sql`(matches.checksum = ${m.checksum} and ${sql.ref(steamColumn)} in (${sql.join(m.steamIds)}))`);
  return predicates.length
    ? sql<boolean>`(
    (${sql.join(predicates, sql` or `)}) and exists (select 1 from rounds where rounds.match_checksum = matches.checksum and rounds.number = ${sql.ref(roundColumn)})
  )`
    : sql<boolean>`false`;
}
