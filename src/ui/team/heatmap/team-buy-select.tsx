import React from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { EconomyType } from 'csdm/common/types/counter-strike';
import { Select } from 'csdm/ui/components/inputs/select';
import { useTranslateEconomyType } from 'csdm/ui/match/economy/team-economy-breakdown/use-translate-economy-type';

export function useHeatmapBuyLabel() {
  const { t } = useLingui();
  const { translateEconomyType } = useTranslateEconomyType();
  return (buy: EconomyType | null) => {
    if (buy === EconomyType.Full) return t`Rifle (full buy)`;
    if (buy === null || !Object.values(EconomyType).includes(buy)) return t`Unknown buy`;
    return translateEconomyType(buy);
  };
}

export function TeamBuySelect({
  value,
  onChange,
}: {
  value: EconomyType | 'all';
  onChange: (buy: EconomyType | 'all') => void;
}) {
  const { t } = useLingui();
  const label = useHeatmapBuyLabel();
  return (
    <Select<EconomyType | 'all'>
      label={<Trans>Scouted team's buy</Trans>}
      value={value}
      onChange={onChange}
      options={[
        { value: 'all', label: t`All buys` },
        ...Object.values(EconomyType).map((value) => ({ value, label: label(value) })),
      ]}
    />
  );
}
