import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { TeamBuySelect, useHeatmapBuyLabel } from './team-buy-select';
import { Game, TeamNumber, type EconomyType } from 'csdm/common/types/counter-strike';
import { HeatmapEvent } from 'csdm/common/types/heatmap-event';
import type { ImportedSeason } from 'csdm/common/types/imported-season';
import type { HeatmapRound, RoundHeatmapData, RoundHeatmapRequest } from 'csdm/common/types/team-heatmap-timeline';
import { RendererClientMessageName } from 'csdm/server/messages/renderer-client-message-name';
import { Button } from 'csdm/ui/components/buttons/button';
import { Content } from 'csdm/ui/components/content';
import { Heatmap } from 'csdm/ui/components/heatmap/heatmap';
import { HeatmapFilters } from 'csdm/ui/components/heatmap/heatmap-filters';
import { HeatmapProvider } from 'csdm/ui/components/heatmap/heatmap-provider';
import { HeatmapSelectEvent } from 'csdm/ui/components/heatmap/heatmap-select-event';
import { Select } from 'csdm/ui/components/inputs/select';
import { RadarLevelSelect } from 'csdm/ui/components/inputs/select/radar-level-select';
import { useFormatDate } from 'csdm/ui/hooks/use-format-date';
import { useWebSocketClient } from 'csdm/ui/hooks/use-web-socket-client';
import { RadarLevel } from 'csdm/ui/maps/radar-level';
import { useMaps } from 'csdm/ui/maps/use-maps';
import { formatMillisecondsToTimer } from 'csdm/ui/shared/format-milliseconds-to-timer';
import { useTeam } from '../use-team';
import { useHeatmapState } from './use-heatmap-state';
import { getRoundWindow } from './round-window';
import { WindowLengthInput } from './window-length-input';

type MatchOption = Pick<RoundHeatmapRequest, 'checksum' | 'mapName' | 'steamIds' | 'teamName'> & {
  game: Game;
  date: string;
  opponent: string;
  part?: number;
};

export function SeasonRoundHeatmap({ season }: { season: ImportedSeason }) {
  const matches = useMemo(() => season.maps.map((map) => ({ ...map, game: Game.CS2 })), [season]);
  return <RoundHeatmapView matches={matches} />;
}

export function TeamRoundHeatmap() {
  const team = useTeam();
  const matches = useMemo(
    () =>
      team.matches.map((match) => ({
        ...match,
        teamName: team.name,
        opponent: match.teamAName === team.name ? match.teamBName : match.teamAName,
        steamIds: match.players.filter((p) => p.teamName === team.name).map((p) => p.steamId),
      })),
    [team],
  );
  return <RoundHeatmapView matches={matches} />;
}

function RoundHeatmapView({ matches }: { matches: MatchOption[] }) {
  const { t } = useLingui();
  const formatDate = useFormatDate();
  const [checksum, setChecksum] = useState(matches[0]?.checksum);
  const [event, setEvent] = useState<HeatmapEvent>(HeatmapEvent.Positions);
  const [seconds, setSeconds] = useState(10);
  const match = matches.find((match) => match.checksum === checksum) ?? matches[0];
  if (!match)
    return (
      <Content>
        <Trans>No matches available.</Trans>
      </Content>
    );
  const matchSelect = (
    <Select
      label={<Trans>Match</Trans>}
      value={match.checksum}
      onChange={setChecksum}
      options={matches.map(({ checksum, date, mapName, opponent, part }) => ({
        value: checksum,
        label: [formatDate(date), opponent, mapName, part && t`Part ${part}`].filter(Boolean).join(' · '),
      }))}
    />
  );
  return (
    <SingleMatchHeatmap
      key={match.checksum}
      match={match}
      matchSelect={matchSelect}
      event={event}
      setEvent={setEvent}
      seconds={seconds}
      setSeconds={setSeconds}
    />
  );
}

function SingleMatchHeatmap({
  match,
  matchSelect,
  event,
  setEvent,
  seconds,
  setSeconds,
}: {
  match: MatchOption;
  matchSelect: React.ReactNode;
  event: HeatmapEvent;
  setEvent: (event: HeatmapEvent) => void;
  seconds: number;
  setSeconds: (seconds: number) => void;
}) {
  const client = useWebSocketClient();
  const { t } = useLingui();
  const maps = useMaps();
  const { radius, alpha, blur } = useHeatmapState();
  const [radarLevel, setRadarLevel] = useState<RadarLevel>(RadarLevel.Upper);
  const [buy, setBuy] = useState<EconomyType | 'all'>('all');
  const buyLabel = useHeatmapBuyLabel();
  const [number, setNumber] = useState<number>();
  const [cursor, setCursor] = useState(seconds);
  const generation = useRef(0);
  const thresholdZ = maps.find((map) => map.name === match.mapName && map.game === match.game)?.thresholdZ ?? null;
  const request = useMemo(
    () => ({
      checksum: match.checksum,
      teamName: match.teamName,
      mapName: match.mapName,
      steamIds: match.steamIds,
      event,
      radarLevel,
      thresholdZ,
    }),
    [match, event, radarLevel, thresholdZ],
  );
  const [result, setResult] = useState<{ request: RoundHeatmapRequest; data: RoundHeatmapData | null }>();
  const reload = useCallback(
    (signal?: AbortSignal) => {
      const version = ++generation.current;
      const finish = (data: RoundHeatmapData | null) => {
        if (!signal?.aborted && version === generation.current) setResult({ request, data });
      };
      return client
        .send({ name: RendererClientMessageName.FetchRoundHeatmap, payload: request })
        .then(finish, () => finish(null));
    },
    [client, request],
  );
  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);
  const data = result?.request === request ? result.data : undefined;
  const rounds = data?.rounds.filter((r) => buy === 'all' || r.economy === buy) ?? [];
  const round = rounds.find((r) => r.number === number) ?? rounds[0];
  const window = round && getRoundWindow(round, cursor, seconds);
  return (
    <Content>
      <div className="flex h-full">
        <HeatmapProvider
          game={match.game}
          mapName={match.mapName}
          radarLevel={radarLevel}
          radius={radius}
          alpha={alpha}
          blur={blur}
          points={window?.points ?? []}
          fetchPoints={reload}
        >
          <HeatmapFilters scrollable={true}>
            {matchSelect}
            <TeamBuySelect
              value={buy}
              onChange={(value) => {
                setBuy(value);
                setCursor(seconds);
              }}
            />
            {round && data && (
              <Select
                label={<Trans>Round</Trans>}
                value={round.number}
                options={rounds.map(({ number, economy, side }) => ({
                  value: number,
                  label: [
                    t`Round ${number}`,
                    side === TeamNumber.CT ? 'CT' : side === TeamNumber.T ? 'T' : '',
                    buyLabel(economy),
                  ]
                    .filter(Boolean)
                    .join(' · '),
                }))}
                onChange={(n) => {
                  setNumber(n);
                  setCursor(seconds);
                }}
              />
            )}
            <HeatmapSelectEvent event={event} onChange={setEvent} />
            <RadarLevelSelect
              mapName={match.mapName}
              game={match.game}
              selectedRadarLevel={radarLevel}
              onChange={setRadarLevel}
            />
            <WindowLengthInput seconds={seconds} onChange={setSeconds} />
            {window && round && data && round.duration !== null && (
              <RoundScrubber
                key={round.number + buy}
                window={window}
                round={round}
                clockSeconds={data.clockSeconds}
                onSeek={setCursor}
              />
            )}
          </HeatmapFilters>
          {data === null ? (
            <div role="alert">
              <Trans>Could not load round heatmap.</Trans>
              <Button
                onClick={() => {
                  setResult(undefined);
                  void reload();
                }}
              >
                <Trans>Retry</Trans>
              </Button>
            </div>
          ) : !data ? (
            <p>
              <Trans>Loading round heatmap…</Trans>
            </p>
          ) : !round ? (
            <p>
              <Trans>No rounds match this buy.</Trans>
            </p>
          ) : round.hasPositionSamples === false ? (
            <p>
              <Trans>No positions were recorded for this team in this round.</Trans>
            </p>
          ) : round.duration === null ? (
            <p>
              <Trans>Round timing unavailable.</Trans>
            </p>
          ) : (
            <Heatmap showEmptyMap={true} />
          )}
        </HeatmapProvider>
      </div>
    </Content>
  );
}

function RoundScrubber({
  window: slice,
  round,
  clockSeconds,
  onSeek,
}: {
  window: ReturnType<typeof getRoundWindow>;
  round: HeatmapRound;
  clockSeconds: number;
  onSeek: (second: number) => void;
}) {
  const { t } = useLingui();
  const [playing, setPlaying] = useState(false);
  const { start, end, duration, points } = slice;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (end >= duration) setPlaying(false);
      else onSeek(Math.min(duration, end + 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [playing, end, duration, onSeek]);
  const clockAt = (second: number) => {
    if (round.plantSeconds !== null && second >= round.plantSeconds) {
      const time = formatMillisecondsToTimer((second - round.plantSeconds) * 1000);
      return t`After plant ${time}`;
    }
    const time = formatMillisecondsToTimer(Math.ceil(Math.max(0, clockSeconds - second)) * 1000);
    return t`Round clock ${time}`;
  };
  const count = points.length;
  const clock = clockAt(end);
  const plant = round.plantSeconds;
  return (
    <>
      <label className="flex flex-col gap-y-8">
        <strong className="tabular-nums">{clock}</strong>
        <input
          type="range"
          min={0}
          max={Math.ceil(duration)}
          step={1}
          value={Math.ceil(end)}
          aria-label={t`Round playback clock`}
          aria-valuetext={clock}
          onChange={(event) => {
            setPlaying(false);
            onSeek(Math.min(duration, event.target.valueAsNumber));
          }}
        />
      </label>
      <p className="tabular-nums">
        {clockAt(start)} → {clock} · <Trans>{count} points</Trans>
      </p>
      {plant !== null && (
        <Button
          onClick={() => {
            setPlaying(false);
            onSeek(plant);
          }}
        >
          <Trans>Jump to plant</Trans>
        </Button>
      )}
      <div>
        <Button
          isDisabled={duration === 0}
          onClick={() => {
            if (!playing && end === duration) onSeek(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Trans>Pause</Trans> : <Trans>Play</Trans>}
        </Button>
      </div>
    </>
  );
}
