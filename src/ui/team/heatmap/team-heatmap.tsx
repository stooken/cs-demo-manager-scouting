import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trans } from '@lingui/react/macro';
import { Heatmap } from 'csdm/ui/components/heatmap/heatmap';
import { Content } from 'csdm/ui/components/content';
import { useTeamProfileSettings } from 'csdm/ui/settings/use-team-profile-settings';
import { Game } from 'csdm/common/types/counter-strike';
import { useHeatmapState } from './use-heatmap-state';
import { useWebSocketClient } from 'csdm/ui/hooks/use-web-socket-client';
import { useCurrentTeamName } from '../use-current-team-name';
import type { TeamHeatmapFilter } from 'csdm/common/types/heatmap-filters';
import { RendererClientMessageName } from 'csdm/server/messages/renderer-client-message-name';
import type { TeamHeatmapTimeline } from 'csdm/common/types/team-heatmap-timeline';
import { RoundClockControl } from './round-clock-control';
import { TeamHeatmapFilters } from './team-heatmap-filters';
import { useShowToast } from 'csdm/ui/components/toasts/use-show-toast';
import { HeatmapProvider } from 'csdm/ui/components/heatmap/heatmap-provider';
import { useDispatch } from 'csdm/ui/store/use-dispatch';
import { fetchPointsSuccess } from './team-heatmap-actions';
import { useTeam } from '../use-team';
import type { ImportedSeason } from 'csdm/common/types/imported-season';
import { RadarLevel } from 'csdm/ui/maps/radar-level';
import { useMaps } from 'csdm/ui/maps/use-maps';

export function TeamHeatmap() {
  const teamName = useCurrentTeamName();
  const { mapsStats } = useTeam();
  return <TeamHeatmapView teamName={teamName} mapNames={mapsStats.map((m) => m.mapName)} />;
}

export function TeamHeatmapView({
  teamName,
  mapNames,
  season,
}: {
  teamName: string;
  mapNames: string[];
  season?: ImportedSeason;
}) {
  const showToast = useShowToast();
  const dispatch = useDispatch();
  const { games, tagIds, demoSources, demoTypes, startDate, endDate, gameModes, maxRounds } = useTeamProfileSettings();
  const game = !season && games.includes(Game.CSGO) ? Game.CSGO : Game.CS2;
  const client = useWebSocketClient();
  const generation = useRef(0);
  const { alpha, blur, radius, event, sides, mapName: savedMap, radarLevel, players } = useHeatmapState();
  const mapName = season && !mapNames.includes(savedMap) ? mapNames[0] : savedMap;
  const [timeline, setTimeline] = useState<TeamHeatmapTimeline>({ frames: [], outsideClock: [] });
  const [frameIndex, setFrameIndex] = useState<number | null>(null);
  const [windowSeconds, setWindowSeconds] = useState(10);
  const wholeRound = useMemo(
    () => [...timeline.outsideClock, ...timeline.frames.flatMap((frame) => frame.points)],
    [timeline],
  );
  const frame = frameIndex === null ? undefined : timeline.frames[frameIndex];
  const isInitialRender = useRef(true);
  const maps = useMaps();

  const fetchPoints = async (filters?: Partial<TeamHeatmapFilter>) => {
    const version = ++generation.current;
    try {
      const newMapName = filters?.mapName ?? mapName;
      const map = maps.find((map) => {
        return map.name === newMapName && map.game === game;
      });
      const payload: TeamHeatmapFilter = {
        windowSeconds: filters?.windowSeconds ?? windowSeconds,
        demoTypes,
        endDate,
        event: filters?.event ?? event,
        gameModes,
        games,
        mapName: newMapName,
        maxRounds,
        players: filters?.players ?? players,
        radarLevel: filters?.radarLevel ?? (newMapName !== savedMap ? RadarLevel.Upper : radarLevel),
        sides: filters?.sides ?? sides,
        sources: demoSources,
        startDate,
        tagIds,
        teamName,
        ...(season
          ? {
              seasonMaps: season.maps
                .filter((m) => m.mapName === newMapName)
                .map(({ checksum, steamIds }) => ({ checksum, steamIds })),
              games: [Game.CS2],
              sources: [],
              demoTypes: [],
              gameModes: [],
              tagIds: [],
              maxRounds: [],
              startDate: undefined,
              endDate: undefined,
            }
          : {}),
        thresholdZ: map?.thresholdZ ?? null,
      };
      const timeline = await client.send({
        name: RendererClientMessageName.FetchTeamHeatmapTimeline,
        payload,
      });

      if (version !== generation.current) return;
      setTimeline(timeline);
      setWindowSeconds(payload.windowSeconds ?? 10);
      setFrameIndex((index) => {
        if (index === null || !timeline.frames.length) return null;
        if (filters?.windowSeconds && frame) {
          const sameTime = timeline.frames.findIndex(
            (f) =>
              f.phase === frame.phase &&
              (f.phase === 'round'
                ? f.startSeconds >= frame.startSeconds && f.endSeconds < frame.startSeconds
                : f.startSeconds <= frame.startSeconds && f.endSeconds > frame.startSeconds),
          );
          if (sameTime >= 0) return sameTime;
        }
        return Math.min(index, timeline.frames.length - 1);
      });
      dispatch(fetchPointsSuccess(payload));
    } catch (error) {
      showToast({
        content: <Trans>An error occurred</Trans>,
        id: 'heatmap-error',
        type: 'error',
      });
    }
  };

  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      void fetchPoints();
    }
  });

  const selectedMaps = season?.maps.filter((m) => m.mapName === mapName) ?? [];
  const mapCount = selectedMaps.length;
  const roundCount = selectedMaps.reduce((n, m) => n + m.rounds, 0);
  return (
    <Content>
      {season && (
        <p>
          <Trans>
            {mapName} · {mapCount} maps · {roundCount} rounds before event filters
          </Trans>
        </p>
      )}
      <div className="flex h-full">
        <HeatmapProvider
          game={game}
          mapName={mapName}
          points={frame?.points ?? wholeRound}
          radarLevel={radarLevel}
          alpha={alpha}
          blur={blur}
          radius={radius}
          fetchPoints={fetchPoints}
        >
          <TeamHeatmapFilters mapNames={mapNames}>
            <RoundClockControl
              frames={timeline.frames}
              index={frameIndex}
              onChange={setFrameIndex}
              windowSeconds={windowSeconds}
              onWindowChange={(windowSeconds) => void fetchPoints({ windowSeconds })}
            />
          </TeamHeatmapFilters>
          <Heatmap showEmptyMap={Boolean(frame)} />
        </HeatmapProvider>
      </div>
    </Content>
  );
}
