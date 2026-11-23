import React, { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { Trans } from '@lingui/react/macro';
import { Content } from 'csdm/ui/components/content';
import { buildMatch2dViewerRoundPath } from 'csdm/ui/routes-paths';
import { useWebSocketClient } from 'csdm/ui/hooks/use-web-socket-client';
import { RendererClientMessageName } from 'csdm/server/messages/renderer-client-message-name';
import type { ImportedSeason, PaceRound } from 'csdm/common/types/imported-season';
import { medianSample, criteria } from 'csdm/common/scouting-criteria';

export function SeasonScouting({ season }: { season: ImportedSeason }) {
  const { pressureSeconds, switchSeconds } = criteria;
  const client = useWebSocketClient();
  const [rows, setRows] = useState<PaceRound[]>();
  const [error, setError] = useState(false);
  const { teamId, seasonId } = season;
  useEffect(() => {
    let active = true;
    client
      .send({ name: RendererClientMessageName.FetchSeasonPace, payload: { teamId, seasonId } })
      .then((data) => {
        if (active) setRows(data);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [teamId, seasonId, client]);
  if (error)
    return (
      <p>
        <Trans>Could not load scouting data.</Trans>
      </p>
    );
  if (!rows)
    return (
      <p>
        <Trans>Loading rounds…</Trans>
      </p>
    );
  return (
    <Content>
      <div className="flex flex-col gap-y-16">
        <h2>
          <Trans>T-side medians from freeze-time end</Trans>
        </h2>
        <p>
          <Trans>
            Entry requires two living attackers in the same engine-named bombsite. A suspected fake requires enemy
            damage during coordinated pressure without the carrier for {pressureSeconds} seconds, then the carrier and
            another attacker at the other site within {switchSeconds} seconds.
          </Trans>
        </p>
        {[...new Set(season.maps.map((m) => m.mapName))].sort().map((map) => {
          const rounds = rows.filter((r) => r.map === map);
          const flagged = rounds.filter((r) => r.flag);
          const flaggedCount = flagged.length;
          const eligible = rounds.filter((r) => r.eligible).length;
          const percent = eligible ? ((flaggedCount / eligible) * 100).toFixed(1) + '%' : '—';
          const excluded = rounds.filter((r) => r.exclusion !== null);
          const excludedCount = excluded.length;
          return (
            <section key={map} className="flex flex-col gap-y-8">
              <h3>{map}</h3>
              <table>
                <thead>
                  <tr>
                    <th>
                      <Trans>First enemy damage</Trans>
                    </th>
                    <th>
                      <Trans>Committed entry</Trans>
                    </th>
                    <th>
                      <Trans>Plant</Trans>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {(['contact', 'entry', 'plant'] as const).map((metric) => {
                      const { median, count } = medianSample(rounds.map((r) => r[metric]));
                      return (
                        <td key={metric}>
                          {median === null ? '—' : median.toFixed(1) + ' s'} · <Trans>{count} rounds</Trans>
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
              <p>
                <Trans>Suspected fake rate</Trans> · {percent} ·{' '}
                <Trans>
                  {flaggedCount} flagged / {eligible} eligible T rounds
                </Trans>
              </p>
              {flagged.map(({ flag, round, checksum }) => {
                if (!flag) return null;
                const { from, to, pressureTick } = flag;
                const pressureTime = flag.pressureTime.toFixed(1);
                const commitTime = flag.commitTime.toFixed(1);
                return (
                  <Link
                    key={checksum + round}
                    className="underline"
                    to={buildMatch2dViewerRoundPath(checksum, round) + '?tick=' + pressureTick}
                  >
                    <Trans>
                      Round {round} · pressure at {from} at {pressureTime} s → bomb commit at {to} at {commitTime} s
                    </Trans>
                  </Link>
                );
              })}
              {excluded.length > 0 && (
                <details>
                  <summary>
                    <Trans>{excludedCount} rounds excluded from fake rate</Trans>
                  </summary>
                  {excluded.map(({ checksum, round, exclusion }) => (
                    <p key={checksum + round}>
                      {checksum} · <Trans>Round {round}</Trans> ·{' '}
                      {exclusion === 'zones' ? (
                        <Trans>Site data unavailable</Trans>
                      ) : exclusion === 'positions' ? (
                        <Trans>Position data unavailable</Trans>
                      ) : exclusion === 'side' ? (
                        <Trans>Ambiguous team side</Trans>
                      ) : (
                        <Trans>Incomplete round clock</Trans>
                      )}
                    </p>
                  ))}
                </details>
              )}
            </section>
          );
        })}
      </div>
    </Content>
  );
}
