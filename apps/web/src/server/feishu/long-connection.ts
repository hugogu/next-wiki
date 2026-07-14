import * as lark from '@larksuiteoapi/node-sdk';
import { logger } from '@/server/logger';
import { getDecryptedConfig, recordHealth } from '@/server/services/feishu-config';
import { buildInboundEvent, createFeishuTransport } from './transport';
import { processInboundEvent } from './webhook-handler';

let client: lark.WSClient | null = null;
let fingerprint: string | null = null;

/** Start the single in-process Feishu WebSocket event connection when configured. */
export async function startFeishuLongConnection(): Promise<void> {
  const config = await getDecryptedConfig();
  if (!config) return;
  const nextFingerprint = `${config.appId}:${config.appSecret}`;
  if (client && fingerprint === nextFingerprint) return;
  client?.close();

  const transport = createFeishuTransport(config);
  const dispatcher = new lark.EventDispatcher({ loggerLevel: lark.LoggerLevel.error });
  dispatcher.register({
    'im.message.receive_v1': async (data) => {
      const event = buildInboundEvent(data as Record<string, unknown>);
      if (event) await processInboundEvent({ transport, event });
    },
  });
  client = new lark.WSClient({
    appId: config.appId,
    appSecret: config.appSecret,
    loggerLevel: lark.LoggerLevel.error,
    onReady: () => void recordHealth({ connectedAt: new Date(), error: null }),
    onReconnected: () => void recordHealth({ connectedAt: new Date(), error: null }),
    onReconnecting: () => void recordHealth({ error: 'Feishu WebSocket reconnecting' }),
    onError: (error) => void recordHealth({ error: error.message.slice(0, 500) }),
  });
  fingerprint = nextFingerprint;
  void client.start({ eventDispatcher: dispatcher }).catch((error: unknown) => {
    logger.error('feishu websocket stopped', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    void recordHealth({
      error: error instanceof Error ? error.message.slice(0, 500) : 'WebSocket failed',
    });
  });
}
