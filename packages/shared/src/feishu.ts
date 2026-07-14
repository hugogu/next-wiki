import { z } from 'zod';

// Zero-dependency shared Zod contracts for the optional Feishu integration
// module (019). These bound every value that crosses the module's internal
// seams (webhook → delegation → delivery) and the first-party admin surface.
// The inbound path intentionally never carries a Wiki user id, role, permission
// scope, or a caller-chosen audit origin: the web app resolves the effective
// user from the confirmed Feishu binding alone.

// ---- Bounded enums (mirror db/schema/enums.ts) ------------------------------

export const feishuBindingStatusSchema = z.enum(['active', 'revoked']);
export type FeishuBindingStatus = z.infer<typeof feishuBindingStatusSchema>;

export const feishuInboxStatusSchema = z.enum(['accepted', 'processed', 'rejected']);
export type FeishuInboxStatus = z.infer<typeof feishuInboxStatusSchema>;

export const feishuSessionStateSchema = z.enum(['active', 'expired', 'reset']);
export type FeishuSessionState = z.infer<typeof feishuSessionStateSchema>;

export const feishuNotificationEventTypeSchema = z.enum([
  'page_published',
  'ai_action_completed',
  'transfer_completed',
]);
export type FeishuNotificationEventType = z.infer<typeof feishuNotificationEventTypeSchema>;

export const feishuSubscriptionModeSchema = z.enum([
  'direct',
  'public_safe_group',
  'private_recipients_group',
]);
export type FeishuSubscriptionMode = z.infer<typeof feishuSubscriptionModeSchema>;

export const feishuSubscriptionStatusSchema = z.enum([
  'active',
  'paused',
  'failing',
  'action_required',
]);
export type FeishuSubscriptionStatus = z.infer<typeof feishuSubscriptionStatusSchema>;

export const feishuDeliveryStatusSchema = z.enum([
  'queued',
  'running',
  'delivered',
  'retry',
  'failed',
  'blocked',
  'expired',
]);
export type FeishuDeliveryStatus = z.infer<typeof feishuDeliveryStatusSchema>;

export const feishuConnectionModeSchema = z.enum(['webhook']);
export type FeishuConnectionMode = z.infer<typeof feishuConnectionModeSchema>;

// The `feishu` audit origin lives in `audit.ts` (auditOriginSchema).

// ---- Feishu identifier primitives -------------------------------------------

/** App-scoped Feishu identity used for direct messaging. */
export const feishuOpenIdSchema = z.string().min(1).max(128);
/** Feishu chat identifier (direct or group). */
export const feishuChatIdSchema = z.string().min(1).max(128);
export const feishuChatTypeSchema = z.enum(['p2p', 'group']);
export type FeishuChatType = z.infer<typeof feishuChatTypeSchema>;

/**
 * Opaque, bounded trace identifier. Never a raw question, secret, or rendered
 * answer. A UUID or any short opaque token is acceptable.
 */
export const correlationIdSchema = z.string().min(1).max(128);

// ---- Inbound message (webhook → delegation) ---------------------------------

export const feishuInboundMessageSchema = z.object({
  /** `tenant:event_type:message_id` idempotency key consumed by the inbox. */
  eventKey: z.string().min(1).max(256),
  messageId: z.string().min(1).max(128),
  openId: feishuOpenIdSchema,
  chatId: feishuChatIdSchema,
  chatType: feishuChatTypeSchema,
  mentionedBot: z.boolean(),
  text: z.string().max(8_000),
  correlationId: correlationIdSchema,
});
export type FeishuInboundMessage = z.infer<typeof feishuInboundMessageSchema>;

export const feishuResponseTargetSchema = z.object({
  type: z.literal('direct'),
  openId: feishuOpenIdSchema,
});
export type FeishuResponseTarget = z.infer<typeof feishuResponseTargetSchema>;

export const feishuInboundDispositionSchema = z.discriminatedUnion('disposition', [
  z.object({
    disposition: z.literal('bind'),
    bindUrl: z.string().url(),
    correlationId: correlationIdSchema,
  }),
  z.object({
    disposition: z.literal('question_queued'),
    aiActionId: z.string().uuid(),
    responseTarget: feishuResponseTargetSchema,
    correlationId: correlationIdSchema,
  }),
  z.object({
    // An immediate, safe direct reply (e.g. AI disabled, or a reset ack).
    disposition: z.literal('reply'),
    responseTarget: feishuResponseTargetSchema,
    text: z.string().max(4_000),
    correlationId: correlationIdSchema,
  }),
  z.object({
    disposition: z.literal('ignored'),
    correlationId: correlationIdSchema,
  }),
]);
export type FeishuInboundDisposition = z.infer<typeof feishuInboundDispositionSchema>;

// ---- Delivery targets and cards (delivery worker → transport) ----------------

export const feishuCitationSchema = z.object({
  title: z.string().max(512),
  url: z.string().url(),
});
export type FeishuCitation = z.infer<typeof feishuCitationSchema>;

export const feishuDeliveryTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('direct'), openId: feishuOpenIdSchema }),
  z.object({ type: z.literal('group'), chatId: feishuChatIdSchema }),
]);
export type FeishuDeliveryTarget = z.infer<typeof feishuDeliveryTargetSchema>;

// ---- First-party binding confirmation ---------------------------------------

export const feishuBindingConfirmInputSchema = z.object({
  token: z.string().min(1).max(512),
});
export type FeishuBindingConfirmInput = z.infer<typeof feishuBindingConfirmInputSchema>;

// ---- First-party admin config (write-only secrets) --------------------------

export const feishuConfigInputSchema = z.object({
  enabled: z.boolean().optional(),
  appId: z.string().min(1).max(128).optional(),
  /** Write-only: present only when the admin is setting/rotating the secret. */
  appSecret: z.string().min(1).max(512).optional(),
  encryptKey: z.string().min(1).max(512).optional(),
  verificationToken: z.string().min(1).max(512).optional(),
  userRateLimitPerMinute: z.number().int().min(1).max(600).optional(),
  chatRateLimitPerMinute: z.number().int().min(1).max(600).optional(),
  notificationRetentionHours: z.number().int().min(24).max(168).optional(),
});
export type FeishuConfigInput = z.infer<typeof feishuConfigInputSchema>;

/** Masked configuration view returned to admins — never a plaintext secret. */
export const feishuConfigViewSchema = z.object({
  enabled: z.boolean(),
  appId: z.string().nullable(),
  hasAppSecret: z.boolean(),
  hasEncryptKey: z.boolean(),
  hasVerificationToken: z.boolean(),
  connectionMode: feishuConnectionModeSchema,
  userRateLimitPerMinute: z.number().int(),
  chatRateLimitPerMinute: z.number().int(),
  notificationRetentionHours: z.number().int(),
  lastConnectedAt: z.string().nullable(),
  lastError: z.string().nullable(),
});
export type FeishuConfigView = z.infer<typeof feishuConfigViewSchema>;
