import React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { Select } from 'csdm/ui/components/inputs/select';
import { formatMillisecondsToTimer } from 'csdm/ui/shared/format-milliseconds-to-timer';
import { WindowLengthInput } from './window-length-input';
import type { ComparisonWindow } from './round-comparison';

export function RoundClockControl({
  windows,
  value,
  onChange,
  width,
  setWidth,
}: {
  windows: ComparisonWindow[];
  value: string;
  onChange: (key: string) => void;
  width: number;
  setWidth: (width: number) => void;
}) {
  const { t } = useLingui();
  const options = windows.map((window) => {
    const start = formatMillisecondsToTimer(window.start * 1000);
    const end = formatMillisecondsToTimer(window.end * 1000);
    return {
      value: window.phase + window.start,
      label: window.phase === 'round' ? t`Round clock ${start} → ${end}` : t`After plant ${start} → ${end}`,
    };
  });
  return (
    <>
      <WindowLengthInput seconds={width} onChange={setWidth} />
      <Select
        label={<Trans>Compare at</Trans>}
        value={value}
        onChange={onChange}
        options={[{ value: 'all', label: t`Whole live round` }, ...options]}
      />
    </>
  );
}
