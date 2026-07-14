import type { FeishuRegistrationDomain } from '@next-wiki/shared';

const REGISTRATION_PATH = '/oauth/v1/app/registration';
const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_INTERVAL_SECONDS = 5;
const DEFAULT_EXPIRE_SECONDS = 600;
const SCAN_TO_CREATE_TP = 'ob_cli_app';

type FetchLike = typeof fetch;

type BeginResponse = {
  device_code?: string;
  verification_uri_complete?: string;
  interval?: number;
  expire_in?: number;
};

type PollResponse = {
  client_id?: string;
  client_secret?: string;
  error?: string;
  error_description?: string;
};

export type StartedAppRegistration = {
  deviceCode: string;
  qrUrl: string;
  pollIntervalSeconds: number;
  expiresInSeconds: number;
};

export type AppRegistrationPollResult =
  | { status: 'pending' }
  | { status: 'denied' }
  | { status: 'expired' }
  | { status: 'completed'; appId: string; appSecret: string }
  | { status: 'failed'; message: string };

function accountsBaseUrl(domain: FeishuRegistrationDomain): string {
  return domain === 'lark' ? 'https://accounts.larksuite.com' : 'https://accounts.feishu.cn';
}

function validSeconds(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 3600
    ? Math.floor(value)
    : fallback;
}

async function postRegistration<T>(
  domain: FeishuRegistrationDomain,
  body: Record<string, string>,
  fetchImpl: FetchLike = fetch,
): Promise<T> {
  const response = await fetchImpl(`${accountsBaseUrl(domain)}${REGISTRATION_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    throw new Error('Feishu registration returned an invalid response');
  }
  return payload as T;
}

/** Start the same device-code registration flow used by OpenClaw's Feishu plugin. */
export async function startAppRegistration(
  domain: FeishuRegistrationDomain,
  fetchImpl?: FetchLike,
): Promise<StartedAppRegistration> {
  const init = await postRegistration<{ supported_auth_methods?: unknown }>(
    domain,
    { action: 'init' },
    fetchImpl,
  );
  if (
    !Array.isArray(init.supported_auth_methods) ||
    !init.supported_auth_methods.includes('client_secret')
  ) {
    throw new Error('This Feishu environment does not support app registration');
  }

  const begin = await postRegistration<BeginResponse>(
    domain,
    {
      action: 'begin',
      archetype: 'PersonalAgent',
      auth_method: 'client_secret',
      request_user_info: 'open_id',
    },
    fetchImpl,
  );
  if (!begin.device_code || !begin.verification_uri_complete) {
    throw new Error('Feishu registration did not return a device code');
  }

  const qrUrl = new URL(begin.verification_uri_complete);
  if (qrUrl.protocol !== 'https:') {
    throw new Error('Feishu registration returned an unsafe QR URL');
  }
  qrUrl.searchParams.set('from', 'next_wiki');
  qrUrl.searchParams.set('tp', SCAN_TO_CREATE_TP);

  return {
    deviceCode: begin.device_code,
    qrUrl: qrUrl.toString(),
    pollIntervalSeconds: validSeconds(begin.interval, DEFAULT_POLL_INTERVAL_SECONDS),
    expiresInSeconds: validSeconds(begin.expire_in, DEFAULT_EXPIRE_SECONDS),
  };
}

/** Poll once. The browser schedules subsequent calls; no background process is needed. */
export async function pollAppRegistration(
  domain: FeishuRegistrationDomain,
  deviceCode: string,
  fetchImpl?: FetchLike,
): Promise<AppRegistrationPollResult> {
  const result = await postRegistration<PollResponse>(
    domain,
    { action: 'poll', device_code: deviceCode, tp: SCAN_TO_CREATE_TP },
    fetchImpl,
  );
  if (result.client_id && result.client_secret) {
    return { status: 'completed', appId: result.client_id, appSecret: result.client_secret };
  }
  if (result.error === 'authorization_pending' || result.error === 'slow_down') {
    return { status: 'pending' };
  }
  if (result.error === 'access_denied') return { status: 'denied' };
  if (result.error === 'expired_token' || result.error === 'expired') return { status: 'expired' };
  return { status: 'failed', message: result.error_description ?? 'Feishu registration failed' };
}
