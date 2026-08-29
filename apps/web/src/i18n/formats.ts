export const formats = {
  dateTime: {
    short: {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    },
    shortWithSeconds: {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    },
    long: {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    },
  },
  number: {
    integer: {
      maximumFractionDigits: 0,
    },
    decimal: {
      maximumFractionDigits: 2,
    },
    compact: {
      notation: 'compact',
      maximumFractionDigits: 1,
    },
  },
} as const;

export type AppFormats = typeof formats;
