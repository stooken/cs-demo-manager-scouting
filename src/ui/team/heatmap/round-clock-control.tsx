import React, { useEffect, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import type { HeatmapFrame } from 'csdm/common/types/team-heatmap-timeline';
import { Button } from 'csdm/ui/components/buttons/button';
import { Checkbox } from 'csdm/ui/components/inputs/checkbox';
import { formatMillisecondsToTimer } from 'csdm/ui/shared/format-milliseconds-to-timer';
import { WindowLengthInput } from './window-length-input';

type Props = {
  frames: HeatmapFrame[];
  index: number | null;
  onChange: (index: number | null) => void;
  windowSeconds: number;
  onWindowChange: (value: number) => void;
};

export function RoundClockControl({ frames, index, onChange, windowSeconds, onWindowChange }: Props) {
  const { t } = useLingui();
  const [playing, setPlaying] = useState(false);
  const last = frames.length - 1;
  const frame = index === null ? undefined : frames[index];
  useEffect(() => {
    if (!playing || index === null || !frame) return;
    const timer = window.setTimeout(() => {
      if (index >= last) {
        setPlaying(false);
      } else {
        onChange(index + 1);
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [playing, index, last, onChange, frame]);

  const start = formatMillisecondsToTimer((frame?.startSeconds ?? 0) * 1000);
  const end = formatMillisecondsToTimer((frame?.endSeconds ?? 0) * 1000);
  const label = frame?.phase === 'post-plant' ? t`After plant ${start} → ${end}` : t`Round clock ${start} → ${end}`;
  const count = frame?.points.length ?? 0;
  return (
    <div className="flex flex-col gap-y-8 py-8">
      <Checkbox
        label={<Trans>Round timeline</Trans>}
        isDisabled={!frames.length && index === null}
        isChecked={index !== null}
        onChange={(event) => {
          setPlaying(false);
          onChange(event.target.checked ? 0 : null);
        }}
      />
      {index !== null && frame && (
        <>
          <WindowLengthInput
            seconds={windowSeconds}
            onChange={(value) => {
              setPlaying(false);
              onWindowChange(value);
            }}
          />
          <div className="flex flex-wrap items-center gap-x-12">
            <span className="font-bold tabular-nums">{label}</span>
            <span className="text-gray-600">
              <Trans>{count} points</Trans>
            </span>
          </div>
          <div className="flex items-center gap-x-12">
            <Button
              isDisabled={last < 1}
              onClick={() => {
                if (!playing && index === last) onChange(0);
                setPlaying(!playing);
              }}
            >
              {playing ? <Trans>Pause</Trans> : <Trans>Play</Trans>}
            </Button>
            <input
              type="range"
              min={0}
              max={last}
              step={1}
              value={index}
              aria-label={t`Round timeline`}
              aria-valuetext={label}
              className="w-full accent-blue-600"
              onChange={(event) => {
                setPlaying(false);
                onChange(Number(event.target.value));
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
