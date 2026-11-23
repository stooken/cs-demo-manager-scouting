import React, { type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  scrollable?: boolean;
};

export function HeatmapFilters({ children, scrollable }: Props) {
  return (
    <div className={`mr-16 flex w-[400px] min-w-[400px] flex-col gap-y-12 ${scrollable ? 'overflow-y-auto pr-8' : ''}`}>
      {children}
    </div>
  );
}
