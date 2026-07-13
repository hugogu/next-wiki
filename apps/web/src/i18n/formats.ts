export const formats = {
  dateTime: {
    short: {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
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
