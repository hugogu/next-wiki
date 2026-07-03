'use client';

import type { ReactNode } from 'react';

export type SettingsTabItem<T extends string> = {
  id: T;
  label: string;
  status?: ReactNode;
};

export function SettingsTabs<T extends string>({
  tabs,
  selected,
  onSelect,
  children,
}: {
  tabs: SettingsTabItem<T>[];
  selected: T;
  onSelect: (tab: T) => void;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-md md:grid-cols-[14rem_minmax(0,1fr)]">
      <div role="tablist" aria-orientation="vertical" className="space-y-xs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected === tab.id}
            onClick={() => onSelect(tab.id)}
            className={`flex w-full items-center justify-between gap-sm rounded-md px-md py-sm text-left ${
              selected === tab.id
                ? 'bg-primary text-primary-text'
                : 'text-foreground hover:bg-surface-elevated'
            }`}
          >
            <span>{tab.label}</span>
            {tab.status && <span className="text-xs opacity-80">{tab.status}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-w-0 space-y-md">
        {children}
      </div>
    </div>
  );
}
