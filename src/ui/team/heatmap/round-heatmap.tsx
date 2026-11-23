import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Game } from 'csdm/common/types/counter-strike';
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

type MatchOption = Pick<RoundHeatmapRequest, 'checksum' | 'mapName' | 'steamIds'> & {
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
  const [number, setNumber] = useState<number>();
  const [cursor, setCursor] = useState(0);
  const generation = useRef(0);
  const thresholdZ = maps.find((map) => map.name === match.mapName && map.game === match.game)?.thresholdZ ?? null;
  const request = useMemo(
    () => ({
      checksum: match.checksum,
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
  const round = data?.rounds.find((r) => r.number === number) ?? data?.rounds[0];
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
          <HeatmapFilters>
            {matchSelect}
            {round && data && (
              <Select
                label={<Trans>Round</Trans>}
                value={round.number}
                options={data.rounds.map(({ number }) => ({ value: number, label: t`Round ${number}` }))}
                onChange={(n) => {
                  setNumber(n);
                  setCursor(0);
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
                key={round.number}
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
          ) : !round || round.duration === null ? (
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
  const { start, end, lastStart, points } = slice;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (start >= lastStart) setPlaying(false);
      else onSeek(start + 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [playing, start, lastStart, onSeek]);
  const clockAt = (second: number) => {
    if (round.plantSeconds !== null && second >= round.plantSeconds) {
      const time = formatMillisecondsToTimer((second - round.plantSeconds) * 1000);
      return t`After plant ${time}`;
    }
    const time = formatMillisecondsToTimer(Math.max(0, clockSeconds - second) * 1000);
    return t`Round clock ${time}`;
  };
  const from = formatMillisecondsToTimer(start * 1000);
  const to = formatMillisecondsToTimer(end * 1000);
  const count = points.length;
  return (
    <>
      <label className="flex flex-col gap-y-8">
        <span>
          <Trans>Time since freeze end</Trans>
        </span>
        <input
          type="range"
          min={0}
          max={lastStart}
          step={1}
          value={start}
          aria-valuetext={from}
          onChange={(event) => {
            setPlaying(false);
            onSeek(event.target.valueAsNumber);
          }}
        />
      </label>
      <div className="tabular-nums">
        {from} – {to} · <Trans>{count} points</Trans>
      </div>
      <div>
        {clockAt(start)} → {clockAt(end)}
      </div>
      <div>
        <Button
          isDisabled={lastStart === 0}
          onClick={() => {
            if (!playing && start === lastStart) onSeek(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Trans>Pause</Trans> : <Trans>Play</Trans>}
        </Button>
      </div>
    </>
  );
}
