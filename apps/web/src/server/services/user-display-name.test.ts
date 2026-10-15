import { describe, expect, it } from 'vitest';
import { getUserDisplayName } from './user-display-name';

describe('getUserDisplayName', () => {
  it('returns a trimmed profile display name when one is set', () => {
    expect(getUserDisplayName({ displayName: '  Ada Lovelace  ', email: 'ada@example.com' })).toBe('Ada Lovelace');
  });

  it('falls back to the email local part when the profile name is missing', () => {
    expect(getUserDisplayName({ displayName: null, email: 'ada.lovelace@example.com' })).toBe('ada.lovelace');
  });

  it('falls back to the email local part when the profile name is blank', () => {
    expect(getUserDisplayName({ displayName: '   ', email: 'ada@example.com' })).toBe('ada');
  });

  it('returns null when the user or email is missing', () => {
    expect(getUserDisplayName(null)).toBeNull();
    expect(getUserDisplayName(undefined)).toBeNull();
    expect(getUserDisplayName({ displayName: null, email: '' })).toBeNull();
  });

  it('returns the whole email value when it has no at sign', () => {
    expect(getUserDisplayName({ displayName: null, email: 'ada' })).toBe('ada');
  });
});
