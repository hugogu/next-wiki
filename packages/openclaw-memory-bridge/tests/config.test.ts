import { describe, expect, it } from 'vitest';
import { ConfigError, parseBridgeConfig } from '../src/config';

const VALID = {
  wikiApiBaseUrl: 'https://wiki.example.com/api/v1',
  credential: 'nwk_secret_value',
};

describe('parseBridgeConfig', () => {
  it('accepts a minimal valid configuration with safe defaults', () => {
    const config = parseBridgeConfig(VALID);
    expect(config).toEqual({
      wikiApiBaseUrl: 'https://wiki.example.com/api/v1',
      credential: 'nwk_secret_value',
      capture: { enabled: false, modes: [] },
      tools: { enabled: false },
      promptEnrichment: { enabled: false },
    });
  });

  it('disables capture by default even when the config is otherwise present', () => {
    const config = parseBridgeConfig({ ...VALID, capture: { modes: ['turn'] } });
    expect(config.capture).toEqual({ enabled: false, modes: ['turn'] });
  });

  it('rejects a non-https base URL outside local development', () => {
    expect(() => parseBridgeConfig({ ...VALID, wikiApiBaseUrl: 'http://wiki.example.com/api/v1' })).toThrow(ConfigError);
  });

  it('allows http for localhost', () => {
    expect(() => parseBridgeConfig({ ...VALID, wikiApiBaseUrl: 'http://localhost:3000/api/v1' })).not.toThrow();
  });

  it('rejects a base URL that does not end in /api/v1', () => {
    expect(() => parseBridgeConfig({ ...VALID, wikiApiBaseUrl: 'https://wiki.example.com/api/v2' })).toThrow(ConfigError);
  });

  it('rejects a missing or empty credential', () => {
    expect(() => parseBridgeConfig({ ...VALID, credential: '' })).toThrow(ConfigError);
    expect(() => parseBridgeConfig({ wikiApiBaseUrl: VALID.wikiApiBaseUrl })).toThrow(ConfigError);
  });

  it('never includes the credential value in a thrown error message', () => {
    try {
      parseBridgeConfig({ wikiApiBaseUrl: 'not-a-url', credential: 'super-secret-credential-value' });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain('super-secret-credential-value');
    }
  });

  it('rejects an unsupported capture mode', () => {
    expect(() => parseBridgeConfig({ ...VALID, capture: { modes: ['unsupported'] } })).toThrow(ConfigError);
  });

  it('rejects a non-object configuration', () => {
    expect(() => parseBridgeConfig(null)).toThrow(ConfigError);
    expect(() => parseBridgeConfig('nope')).toThrow(ConfigError);
  });
});
