import { describe, expect, it, vi } from 'vitest';
import { pollAppRegistration, startAppRegistration } from './app-registration';

function response(payload: unknown) {
  return new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });
}

describe('Feishu application registration client', () => {
  it('starts the device-code flow and decorates the Feishu QR link', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ supported_auth_methods: ['client_secret'] }))
      .mockResolvedValueOnce(
        response({
          device_code: 'device-code-secret',
          verification_uri_complete: 'https://accounts.feishu.cn/verify?code=abc',
          interval: 7,
          expire_in: 900,
        }),
      );

    const started = await startAppRegistration('feishu', fetchImpl);

    expect(started).toMatchObject({
      deviceCode: 'device-code-secret',
      pollIntervalSeconds: 7,
      expiresInSeconds: 900,
    });
    expect(started.qrUrl).toContain('from=next_wiki');
    expect(started.qrUrl).toContain('tp=ob_cli_app');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0]![0])).toMatch(/^https:\/\/accounts\.feishu\.cn\//);
  });

  it('keeps polling server-side until credentials are returned', async () => {
    const pending = await pollAppRegistration(
      'feishu',
      'device-code-secret',
      vi.fn().mockResolvedValue(response({ error: 'authorization_pending' })),
    );
    const complete = await pollAppRegistration(
      'feishu',
      'device-code-secret',
      vi.fn().mockResolvedValue(response({ client_id: 'cli_app', client_secret: 'app-secret' })),
    );

    expect(pending).toEqual({ status: 'pending' });
    expect(complete).toEqual({ status: 'completed', appId: 'cli_app', appSecret: 'app-secret' });
  });

  it('rejects unsupported registration environments', async () => {
    await expect(
      startAppRegistration(
        'feishu',
        vi.fn().mockResolvedValue(response({ supported_auth_methods: [] })),
      ),
    ).rejects.toThrow('does not support app registration');
  });
});
