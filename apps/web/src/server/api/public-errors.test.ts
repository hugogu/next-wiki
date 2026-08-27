import { DomainError } from '@/server/errors';
import { mapPublicDomainError, mapPublicDomainErrorCode } from './public-errors';

describe('mapPublicDomainErrorCode', () => {
  it('maps writing-mode space errors to 403 with the code echoed', () => {
    expect(mapPublicDomainErrorCode('SPACE_UNAVAILABLE')).toEqual({ code: 'SPACE_UNAVAILABLE', status: 403 });
    expect(mapPublicDomainErrorCode('SPACE_FORBIDDEN')).toEqual({ code: 'SPACE_FORBIDDEN', status: 403 });
    expect(mapPublicDomainErrorCode('RAW_SPACE_IMMUTABLE')).toEqual({ code: 'RAW_SPACE_IMMUTABLE', status: 403 });
  });

  it('maps mode-switch errors to 409/422 with the code echoed', () => {
    expect(mapPublicDomainErrorCode('MODE_SWITCH_IN_PROGRESS')).toEqual({ code: 'MODE_SWITCH_IN_PROGRESS', status: 409 });
    expect(mapPublicDomainErrorCode('MODE_SWITCH_INVALID')).toEqual({ code: 'MODE_SWITCH_INVALID', status: 422 });
  });

  it('maps OKF and link errors to 422 with the code echoed', () => {
    expect(mapPublicDomainErrorCode('OKF_TYPE_REQUIRED')).toEqual({ code: 'OKF_TYPE_REQUIRED', status: 422 });
    expect(mapPublicDomainErrorCode('OKF_RESERVED_PATH')).toEqual({ code: 'OKF_RESERVED_PATH', status: 422 });
    expect(mapPublicDomainErrorCode('LINK_TARGET_INVALID')).toEqual({ code: 'LINK_TARGET_INVALID', status: 422 });
  });

  it('keeps the existing mappings stable', () => {
    expect(mapPublicDomainErrorCode('FORBIDDEN')).toEqual({ code: 'FORBIDDEN', status: 403 });
    expect(mapPublicDomainErrorCode('STALE_REVISION')).toEqual({ code: 'STALE_REVISION', status: 409 });
  });

  it('maps Agent memory errors without downgrading their safe status', () => {
    expect(mapPublicDomainErrorCode('AGENT_MEMORY_SCOPE_REQUIRED')).toEqual({ code: 'AGENT_MEMORY_SCOPE_REQUIRED', status: 403 });
    expect(mapPublicDomainErrorCode('AGENT_MEMORY_RECORD_NOT_FOUND')).toEqual({ code: 'AGENT_MEMORY_RECORD_NOT_FOUND', status: 404 });
    expect(mapPublicDomainErrorCode('AGENT_MEMORY_INCOMPATIBLE_CLIENT')).toEqual({ code: 'AGENT_MEMORY_INCOMPATIBLE_CLIENT', status: 426 });
  });
});

describe('mapPublicDomainError', () => {
  it('preserves the domain code and message in the error envelope', async () => {
    const response = mapPublicDomainError(new DomainError('MODE_SWITCH_IN_PROGRESS', 'writes paused'));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ code: 'MODE_SWITCH_IN_PROGRESS', message: 'writes paused' });
  });
});
