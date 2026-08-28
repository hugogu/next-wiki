import type { BridgeConfig } from './config';
import { normalizeCapture, type CaptureEvent } from './capture';
import type { FileOutbox } from './outbox';

type HookApi = {
  registerHook?: (name: string, handler: (context: Record<string, unknown>) => unknown, options?: Record<string, unknown>) => void;
  registerPromptHook?: (handler: (context: Record<string, unknown>) => Promise<Record<string, unknown> | void>, options?: Record<string, unknown>) => void;
  on?: (name: string, handler: (context: Record<string, unknown>) => unknown) => void;
};

type CaptureEnqueuer = (event: CaptureEvent) => Promise<void>;

function register(api: HookApi, name: string, handler: (context: Record<string, unknown>) => unknown, options?: Record<string, unknown>): void {
  if (api.registerHook) api.registerHook(name, handler, options);
  else api.on?.(name, handler);
}

function messagesFromContext(context: Record<string, unknown>): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages = context.messages;
  if (!Array.isArray(messages)) return [];
  return messages.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    return (role === 'user' || role === 'assistant') && typeof content === 'string'
      ? [{ role, content }]
      : [];
  });
}

async function enqueueContext(kind: string, context: Record<string, unknown>, enqueue: CaptureEnqueuer): Promise<void> {
  const sessionId = typeof context.sessionId === 'string' ? context.sessionId : '';
  const boundary = typeof context.eventId === 'string' ? context.eventId : String(context.timestamp ?? Date.now());
  try {
    const event = normalizeCapture(kind, sessionId, boundary, messagesFromContext(context));
    await enqueue(event);
  } catch {
    // A missing correlation or invalid event is a safe capture skip.
  }
}

export function registerLifecycleHooks(api: HookApi, config: BridgeConfig, enqueue: CaptureEnqueuer, outbox?: FileOutbox): void {
  if (!config.capture.enabled) return;
  if (config.capture.beforeCompaction) {
    register(api, 'before_compaction', (context) => enqueueContext('before_compaction', context, enqueue), { allowConversationAccess: true });
    register(api, 'after_compaction', (context) => enqueueContext('after_compaction', context, enqueue), { allowConversationAccess: true });
  }
  if (config.capture.agentEnd) register(api, 'agent_end', (context) => enqueueContext('agent_end', context, enqueue), { allowConversationAccess: true });
  if (config.capture.sessionEnd) register(api, 'session_end', (context) => enqueueContext('session_end', context, enqueue), { allowConversationAccess: true });
  register(api, 'gateway_start', () => outbox?.open());
  register(api, 'gateway_stop', () => undefined);
}

export function registerPromptEnrichment(
  api: HookApi,
  handler: (context: Record<string, unknown>) => Promise<Record<string, unknown> | void>,
): void {
  const options = { requiresToolAuthority: true, allowConversationAccess: true, allowPromptInjection: true };
  if (api.registerPromptHook) api.registerPromptHook(handler, options);
  else register(api, 'before_prompt_build', handler, options);
}
