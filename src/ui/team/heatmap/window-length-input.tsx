import React, { useState } from 'react';
import { Trans } from '@lingui/react/macro';
import { InputNumber } from 'csdm/ui/components/inputs/number-input';

export function WindowLengthInput({ seconds, onChange }: { seconds: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.target.blur();
      }}
    >
      <InputNumber
        label={<Trans>Window length (seconds)</Trans>}
        value={draft ?? seconds}
        min={1}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          const value = event.target.valueAsNumber;
          setDraft(null);
          if (Number.isSafeInteger(value) && value > 0 && value !== seconds) onChange(value);
        }}
      />
    </div>
  );
}
