export type ToggleButtonOption<T extends string> = {
  value: T;
  label: string;
};

export function ToggleButton<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: ToggleButtonOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex rounded-lg border border-border bg-surface p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`rounded-md px-md py-sm text-sm font-medium transition-colors ${
              active
                ? 'bg-primary text-primary-text shadow-sm'
                : 'text-muted hover:bg-surface-elevated hover:text-foreground'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
