export type SeasonPart = {
  teamId: string;
  seasonId: string;
  teamName: string;
  seasonName: string;
  fixtureId: string;
  part: number;
  checksum: string;
  steamIds: string[];
  stage: string;
};
type SeasonMap = {
  checksum: string;
  fixtureId: string;
  part: number;
  mapName: string;
  teamName: string;
  steamIds: string[];
  rounds: number;
  opponent: string;
  date: string;
};
export type ImportedSeason = {
  teamId: string;
  seasonId: string;
  teamName: string;
  seasonName: string;
  maps: SeasonMap[];
  review: {
    fixtureId: string;
    part: number;
    checksum: string;
    candidates: { name: string; players: string[]; steamIds: string[] }[];
  }[];
};
export type PaceRound = {
  map: string;
  checksum: string;
  round: number;
  contact: number | null;
  entry: number | null;
  plant: number | null;
  eligible: boolean;
  exclusion: 'clock' | 'positions' | 'zones' | 'side' | null;
  flag: { from: string; to: string; pressureTick: number; pressureTime: number; commitTime: number } | null;
};
