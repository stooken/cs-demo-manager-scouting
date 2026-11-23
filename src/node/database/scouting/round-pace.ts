import type { PaceRound } from 'csdm/common/types/imported-season';
import { TeamNumber } from 'csdm/common/types/counter-strike';

import { criteria } from 'csdm/common/scouting-criteria';
type Frame = { tick: number; a: string[]; b: string[]; valid: boolean; carrier: string };
export type Zones = { frames: Frame[]; lastTick: number };
type Hit = { tick: number; attacker_steam_id: string; victim_steam_id: string };
type Site = 'a' | 'b';
const sites: Site[] = ['a', 'b'];

export function roundSide(
  teamName: string,
  r: { team_a_name: string; team_b_name: string; team_a_side: TeamNumber; team_b_side: TeamNumber },
) {
  if (r.team_a_name === r.team_b_name) return null;
  if (r.team_a_name === teamName) return r.team_a_side;
  if (r.team_b_name === teamName) return r.team_b_side;
  return null;
}

type Input = {
  map: string;
  checksum: string;
  round: number;
  start: number;
  end: number;
  rate: number;
  roster: string[];
  side: TeamNumber | null;
  hits: Hit[];
  plant: number | null;
  hasPositions: boolean;
  zones: Zones | null;
};
export function roundPace(input: Input): PaceRound | null {
  const { map, checksum, round, start, end, rate, side, roster, zones } = input;
  if (side === TeamNumber.CT) return null;
  const row: PaceRound = {
    map,
    checksum,
    round,
    contact: null,
    plant: null,
    entry: null,
    flag: null,
    eligible: false,
    exclusion: null,
  };
  if (side !== TeamNumber.T) return { ...row, exclusion: 'side' };
  if (start <= 0 || start >= end || rate <= 0) return { ...row, exclusion: 'clock' };
  const seconds = (tick: number) => (tick - start) / rate;
  const hits = input.hits.filter(
    (h) =>
      h.tick >= start && h.tick <= end && (roster.includes(h.attacker_steam_id) || roster.includes(h.victim_steam_id)),
  );
  if (hits.length) row.contact = seconds(Math.min(...hits.map((h) => h.tick)));
  const plant = input.plant !== null && input.plant >= start && input.plant <= end ? input.plant : null;
  if (plant !== null) row.plant = seconds(plant);
  if (!input.hasPositions) return { ...row, exclusion: 'positions' };
  const stop = plant ?? end;
  const initial = zones?.frames.findLast((f) => f.tick <= start);
  if (!zones || !initial || zones.lastTick < stop) return { ...row, exclusion: 'zones' };
  const frames = [{ ...initial, tick: start }, ...zones.frames.filter((f) => f.tick > start && f.tick <= stop)];
  if (frames.some((f) => !f.valid)) return { ...row, exclusion: 'zones' };
  row.eligible = true;
  const since: Record<Site, number | null> = { a: null, b: null };
  const firstHit: Record<Site, number | null> = { a: null, b: null };
  const bombCommitted: Record<Site, boolean> = { a: false, b: false };
  const pressure: Record<Site, number | null> = { a: null, b: null };
  for (const [index, f] of frames.entries()) {
    const until = frames[index + 1]?.tick ?? stop + 1;
    for (const site of sites) {
      const members = f[site].filter((id) => roster.includes(id));
      if (members.length < criteria.attackers) {
        since[site] = null;
        firstHit[site] = null;
        bombCommitted[site] = false;
        continue;
      }
      row.entry ??= seconds(f.tick);
      const hasCarrier = members.includes(f.carrier);
      const other = site === 'a' ? 'b' : 'a';
      const trigger = pressure[other];
      if (
        hasCarrier &&
        !bombCommitted[site] &&
        trigger !== null &&
        f.tick > trigger &&
        f.tick - trigger <= criteria.switchSeconds * rate &&
        !row.flag
      ) {
        row.flag = {
          from: other.toUpperCase(),
          to: site.toUpperCase(),
          pressureTick: trigger,
          pressureTime: seconds(trigger),
          commitTime: seconds(f.tick),
        };
      }
      // Contested pressure: two living teammates in the zone, without the carrier, for the
      // minimum dwell, with enemy damage involving one of those players during that occupancy.
      bombCommitted[site] = hasCarrier;
      if (hasCarrier) pressure[site] = null;
      if (roster.includes(f.carrier) && !hasCarrier) {
        since[site] ??= f.tick;
        const hit = hits.find(
          (h) =>
            h.tick >= f.tick &&
            h.tick < until &&
            (members.includes(h.attacker_steam_id) || members.includes(h.victim_steam_id)),
        );
        firstHit[site] ??= hit?.tick ?? null;
        const qualified = Math.max(firstHit[site] ?? Infinity, since[site] + criteria.pressureSeconds * rate);
        if (qualified < until) pressure[site] = qualified;
      } else {
        since[site] = null;
        firstHit[site] = null;
      }
    }
  }
  return row;
}
