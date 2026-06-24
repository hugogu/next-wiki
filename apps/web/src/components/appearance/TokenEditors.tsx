'use client';

import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import type {
  FontCatalogEntry,
  UserAppearanceColors,
  UserAppearanceFonts,
  UserAppearanceFontSizes,
} from '@next-wiki/shared';

/** A single color row: native color picker + free-text input (for rgba/hsl). */
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const swatch = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000';
  return (
    <label className="flex items-center justify-between gap-sm text-sm">
      <span className="font-mono text-xs text-muted">{label}</span>
      <span className="flex items-center gap-xs">
        <input
          type="color"
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} swatch`}
          className="h-7 w-8 shrink-0 cursor-pointer rounded border border-border bg-surface p-0"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="max-w-[9rem] font-mono"
          aria-label={label}
        />
      </span>
    </label>
  );
}

/** All 13 color tokens for one mode (light or dark). */
export function ColorTokenGrid({
  title,
  colors,
  tokenKeys,
  onChange,
  labelFor,
}: {
  title: string;
  colors: UserAppearanceColors;
  tokenKeys: string[];
  onChange: (next: UserAppearanceColors) => void;
  labelFor: (key: string) => string;
}) {
  return (
    <section className="space-y-sm">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <div className="grid grid-cols-1 gap-xs sm:grid-cols-2">
        {tokenKeys.map((key) => (
          <ColorField
            key={key}
            label={labelFor(key)}
            value={colors[key] ?? ''}
            onChange={(next) => onChange({ ...colors, [key]: next })}
          />
        ))}
      </div>
    </section>
  );
}

export function FontSlotEditors({
  fonts,
  catalog,
  onChange,
}: {
  fonts: UserAppearanceFonts;
  catalog: FontCatalogEntry[];
  onChange: (next: UserAppearanceFonts) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-sm sm:grid-cols-3">
      {(Object.keys(fonts) as Array<keyof UserAppearanceFonts>).map((slot) => (
        <label key={slot} className="space-y-xs text-sm">
          <span className="block font-medium capitalize">{slot}</span>
          <Select
            value={fonts[slot]}
            onChange={(e) => onChange({ ...fonts, [slot]: e.target.value })}
            aria-label={`font ${slot}`}
          >
            {catalog.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </Select>
        </label>
      ))}
    </div>
  );
}

export function FontSizeEditors({
  sizes,
  onChange,
}: {
  sizes: UserAppearanceFontSizes;
  onChange: (next: UserAppearanceFontSizes) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-sm sm:grid-cols-4">
      {(Object.keys(sizes) as Array<keyof UserAppearanceFontSizes>).map((key) => (
        <label key={key} className="space-y-xs text-sm">
          <span className="block font-mono text-xs text-muted">{key}</span>
          <Input
            value={sizes[key]}
            onChange={(e) => onChange({ ...sizes, [key]: e.target.value })}
            className="font-mono"
            aria-label={`font-size ${key}`}
          />
        </label>
      ))}
    </div>
  );
}
