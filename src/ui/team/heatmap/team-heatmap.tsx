import React, { useEffect, useMemo, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Heatmap } from 'csdm/ui/components/heatmap/heatmap';
import { Content } from 'csdm/ui/components/content';
import { Game, type EconomyType } from 'csdm/common/types/counter-strike';
import { useHeatmapState } from './use-heatmap-state';
import { useWebSocketClient } from 'csdm/ui/hooks/use-web-socket-client';
import type { TeamHeatmapFilter } from 'csdm/common/types/heatmap-filters';
import { RendererClientMessageName } from 'csdm/server/messages/renderer-client-message-name';
import type { HeatmapRoster, RoundHeatmapData } from 'csdm/common/types/team-heatmap-timeline';
import { RoundClockControl } from './round-clock-control';
import { TeamHeatmapFilters } from './team-heatmap-filters';
import { HeatmapProvider } from 'csdm/ui/components/heatmap/heatmap-provider';
import { useDispatch } from 'csdm/ui/store/use-dispatch';
import { filtersChanged } from './team-heatmap-actions';
import { useTeam } from '../use-team';
import { RadarLevel } from 'csdm/ui/maps/radar-level';
import { useMaps } from 'csdm/ui/maps/use-maps';
import { TeamBuySelect } from './team-buy-select';
import { compareRounds, getComparisonWindows } from './round-comparison';
import { coverageBands } from 'csdm/ui/components/heatmap/round-coverage';
import { Select } from 'csdm/ui/components/inputs/select';
import { Button } from 'csdm/ui/components/buttons/button';

type ScoutingMap = HeatmapRoster & { mapName: string; game?: Game };

export function TeamHeatmap() {
  const team = useTeam();
  const fixtures = useMemo(
    () =>
      team.matches.map((match) => ({
        checksum: match.checksum,
        mapName: match.mapName,
        game: match.game,
        teamName: team.name,
        steamIds: match.players.filter((player) => player.teamName === team.name).map((player) => player.steamId),
      })),
    [team],
  );
  return <TeamHeatmapView fixtures={fixtures} mapNames={team.mapsStats.map((m) => m.mapName)} />;
}

export function TeamHeatmapView({ mapNames, fixtures }: { mapNames: string[]; fixtures: ScoutingMap[] }) {
  const { t } = useLingui();
  const dispatch = useDispatch();
  const client = useWebSocketClient();
  const maps = useMaps();
  const { alpha, blur, radius, event, sides, mapName: savedMap, radarLevel, players } = useHeatmapState();
  const mapName = mapNames.includes(savedMap) ? savedMap : (mapNames[0] ?? '');
  const games = [...new Set(fixtures.filter((m) => m.mapName === mapName).map((m) => m.game ?? Game.CS2))];
  const [selectedGame, setGame] = useState<Game>(Game.CS2);
  const game = games.includes(selectedGame) ? selectedGame : (games[0] ?? Game.CS2);
  const level = mapName === savedMap ? radarLevel : RadarLevel.Upper;
  const thresholdZ = maps.find((map) => map.name === mapName && map.game === game)?.thresholdZ ?? null;
  const [metric, setMetric] = useState<'coverage' | 'points'>('coverage');
  const [buy, setBuy] = useState<EconomyType | 'all'>('all');
  const [windowKey, setWindowKey] = useState('all');
  const [width, setWidth] = useState(10);
  const [attempt, setAttempt] = useState(0);
  const request = useMemo(
    () => ({
      mapName,
      event,
      radarLevel: level,
      thresholdZ,
      players,
      sides,
      seasonMaps: fixtures
        .filter(
          (m) =>
            m.mapName === mapName &&
            (m.game ?? Game.CS2) === game &&
            m.steamIds.length &&
            (!players.length || players.some((p) => m.steamIds.includes(p.steamId))),
        )
        .map(({ checksum, teamName, steamIds }) => ({ checksum, teamName, steamIds })),
      teamName: '',
      games: [],
      sources: [],
      demoTypes: [],
      gameModes: [],
      maxRounds: [],
      tagIds: [],
      startDate: undefined,
      endDate: undefined,
    }),
    [mapName, event, level, thresholdZ, players, sides, fixtures, game],
  );
  const [result, setResult] = useState<{ request: typeof request; matches: RoundHeatmapData[] | null }>();
  useEffect(() => {
    let active = true;
    client.send({ name: RendererClientMessageName.FetchTeamHeatmapTimeline, payload: request }).then(
      (matches) => {
        if (active) setResult({ request, matches: Array.isArray(matches) ? matches : null });
      },
      () => {
        if (active) setResult({ request, matches: null });
      },
    );
    return () => {
      active = false;
    };
  }, [client, request, attempt]);
  const matches = result?.request === request ? result.matches : undefined;
  const windows = useMemo(() => getComparisonWindows(matches ?? [], width), [matches, width]);
  const selected = windows.find((w) => w.phase + w.start === windowKey);
  const { points, matching, eligible, observed, missingSamples, coverage } = useMemo(
    () => compareRounds(matches ?? [], buy, sides, selected),
    [matches, buy, sides, selected],
  );
  const count = points.length;
  const changeFilters = (filters?: Partial<TeamHeatmapFilter>) => {
    dispatch(filtersChanged({ mapName, event, sides, radarLevel: level, players, ...filters }));
    return Promise.resolve();
  };
  return (
    <Content>
      <div className="flex h-full">
        <HeatmapProvider
          game={game}
          mapName={mapName}
          points={points}
          radarLevel={level}
          alpha={alpha}
          blur={blur}
          radius={radius}
          fetchPoints={changeFilters}
        >
          <TeamHeatmapFilters mapNames={mapNames} density={metric === 'points'}>
            {games.length > 1 && (
              <Select
                label={<Trans>Game</Trans>}
                value={game}
                onChange={setGame}
                options={games.map((value) => ({
                  value,
                  label: value === Game.CSGO ? 'CS:GO' : value === Game.CS2LT ? 'CS2 LT' : 'CS2',
                }))}
              />
            )}
            <TeamBuySelect value={buy} onChange={setBuy} />
            <RoundClockControl
              windows={windows}
              value={selected ? windowKey : 'all'}
              onChange={setWindowKey}
              width={width}
              setWidth={(value) => {
                setWidth(value);
                const window =
                  selected &&
                  getComparisonWindows(matches ?? [], value).find(
                    (w) =>
                      w.phase === selected.phase &&
                      (w.phase === 'round'
                        ? w.start >= selected.start && selected.start > w.end
                        : w.start <= selected.start && selected.start < w.end),
                  );
                setWindowKey(window ? window.phase + window.start : 'all');
              }}
            />
            <Select<'coverage' | 'points'>
              label={<Trans>Map colors</Trans>}
              value={metric}
              onChange={setMetric}
              options={[
                { value: 'coverage', label: t`Share of eligible rounds` },
                { value: 'points', label: t`Point density` },
              ]}
            />
            {metric === 'coverage' && (
              <div>
                <p>
                  <Trans>Share of eligible rounds with activity in each 128-unit square</Trans>
                </p>
                <div className="flex gap-x-8 tabular-nums">
                  {coverageBands.toReversed().map((band, i) => (
                    <span key={band.minimum} className="flex items-center gap-x-4">
                      <span className="size-12" style={{ backgroundColor: band.color }} />
                      {['<25%', '25–<50%', '50–<75%', '≥75%'][i]}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {matches && (
              <div className="tabular-nums">
                <p>
                  <Trans>
                    {eligible} eligible rounds in this window · {matching} match the filters
                  </Trans>
                </p>
                <p>
                  {missingSamples > 0 && <Trans>{missingSamples} rounds lack recorded positions. </Trans>}
                  <Trans>
                    {observed} rounds with activity · {count} points
                  </Trans>
                </p>
              </div>
            )}
          </TeamHeatmapFilters>
          {matches === null ? (
            <div role="alert">
              <Trans>Could not load round heatmap.</Trans>
              <Button
                onClick={() => {
                  setResult(undefined);
                  setAttempt((n) => n + 1);
                }}
              >
                <Trans>Retry</Trans>
              </Button>
            </div>
          ) : !matches ? (
            <p>
              <Trans>Loading round heatmap…</Trans>
            </p>
          ) : (
            <Heatmap showEmptyMap={true} coverage={metric === 'coverage' ? coverage : undefined} />
          )}
        </HeatmapProvider>
      </div>
    </Content>
  );
}
