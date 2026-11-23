import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { Trans } from '@lingui/react/macro';
import type { ImportedSeason } from 'csdm/common/types/imported-season';
import { RendererClientMessageName } from 'csdm/server/messages/renderer-client-message-name';
import { useWebSocketClient } from 'csdm/ui/hooks/use-web-socket-client';
import { buildMatchPath } from 'csdm/ui/routes-paths';
import { TeamHeatmapView } from '../heatmap/team-heatmap';
import { SeasonScouting } from './season-scouting';
import { SeasonRoundHeatmap } from '../heatmap/round-heatmap';

function useSeasons() {
  const client = useWebSocketClient();
  const { key } = useLocation();
  const [seasons, setSeasons] = useState<ImportedSeason[]>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    client
      .send({ name: RendererClientMessageName.FetchImportedSeasons })
      .then((items) => {
        if (active) {
          setSeasons(items);
          setError(false);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [client, key]);
  return { seasons, error };
}

function seasonPath(s: ImportedSeason, view: string) {
  return '/teams/imported/' + s.teamId + '/' + s.seasonId + '/' + view;
}

export function SeasonLinks() {
  const { seasons, error } = useSeasons();
  if (error)
    return (
      <p>
        <Trans>Could not read imported seasons.</Trans>
      </p>
    );
  if (!seasons?.length) return null;
  return (
    <details className="p-8">
      <summary>
        <Trans>Imported seasons</Trans>
      </summary>
      {seasons.map((s) => (
        <p key={seasonPath(s, 'round-heatmap')}>
          <Link className="underline" to={seasonPath(s, 'round-heatmap')}>
            {s.teamName} · {s.seasonName}
          </Link>
        </p>
      ))}
    </details>
  );
}

export function SeasonWorkspace() {
  const client = useWebSocketClient();
  const navigate = useNavigate();
  const [reviewError, setReviewError] = useState(false);
  const { teamId, seasonId, view } = useParams();
  const { seasons, error } = useSeasons();
  if (error)
    return (
      <p>
        <Trans>Could not read imported seasons.</Trans>
      </p>
    );
  if (!seasons)
    return (
      <p>
        <Trans>Loading team…</Trans>
      </p>
    );
  const season = seasons.find((s) => s.teamId === teamId && s.seasonId === seasonId);
  if (!season)
    return (
      <p>
        <Trans>Imported season unavailable.</Trans>
      </p>
    );
  const reviewCount = season.review.length;
  const mapNames = [...new Set(season.maps.map((m) => m.mapName))].sort();
  return (
    <>
      <div className="flex items-center gap-x-16 p-12">
        <Link to="/teams">
          <Trans>Teams</Trans>
        </Link>
        <strong>
          {season.teamName} · {season.seasonName}
        </strong>
        <Link
          aria-current={view === 'round-heatmap' ? 'page' : undefined}
          className="underline"
          to={seasonPath(season, 'round-heatmap')}
        >
          <Trans>Round playback</Trans>
        </Link>
        <Link
          aria-current={view === 'heatmap' ? 'page' : undefined}
          className="underline"
          to={seasonPath(season, 'heatmap')}
        >
          <Trans>Compare rounds</Trans>
        </Link>
        <Link
          aria-current={view === 'scouting' ? 'page' : undefined}
          className="underline"
          to={seasonPath(season, 'scouting')}
        >
          <Trans>Scouting</Trans>
        </Link>
      </div>
      {season.review.length > 0 && (
        <details className="p-8">
          <summary>
            <Trans>{reviewCount} maps excluded for review</Trans>
          </summary>
          <p>
            <Trans>Check that the analyzed map exists and the fixture roster identifies a single team.</Trans>
          </p>
          {reviewError && (
            <p role="alert">
              <Trans>Could not confirm the roster. Reopen the season and try again.</Trans>
            </p>
          )}
          {season.review.map(({ fixtureId, part, checksum, candidates }) => (
            <div key={fixtureId + part}>
              {fixtureId} · <Trans>Part {part}</Trans> ·{' '}
              <Link to={buildMatchPath(checksum)}>
                <Trans>Inspect match</Trans>
              </Link>
              {candidates.map(({ name, players }) => (
                <p key={name}>
                  <button
                    className="underline"
                    onClick={async () => {
                      try {
                        await client.send({
                          name: RendererClientMessageName.ConfirmSeasonRoster,
                          payload: {
                            teamId: season.teamId,
                            seasonId: season.seasonId,
                            fixtureId,
                            part,
                            checksum,
                            name,
                          },
                        });
                        setReviewError(false);
                        await navigate(seasonPath(season, view ?? 'heatmap'), { replace: true });
                      } catch {
                        setReviewError(true);
                      }
                    }}
                  >
                    <Trans>Use {name}</Trans>
                  </button>{' '}
                  · {players.join(', ')}
                </p>
              ))}
            </div>
          ))}
        </details>
      )}
      {mapNames.length === 0 ? (
        <p>
          <Trans>No resolved maps.</Trans>
        </p>
      ) : view === 'scouting' ? (
        <SeasonScouting key={season.maps.map((m) => m.checksum).join(',')} season={season} />
      ) : view === 'round-heatmap' ? (
        <SeasonRoundHeatmap key={seasonPath(season, view)} season={season} />
      ) : (
        <TeamHeatmapView
          key={seasonPath(season, 'heatmap') + season.maps.map((m) => m.checksum).join(',')}
          fixtures={season.maps}
          mapNames={mapNames}
        />
      )}
    </>
  );
}
