// User-facing bot copy. Because an unbound Feishu user's Wiki locale is not yet
// known, binding-stage messages are bilingual (中文 / English). Once a user is
// bound, grounded answers come back in the language of their question, so this
// module only covers the pre-binding and generic operational messages.

export const feishuCopy = {
  /** Private DM sent to a user who needs to bind. `url` is never posted to a group. */
  bindPrompt(url: string): string {
    return (
      `请点击以下链接绑定你的 Wiki 账号（10 分钟内有效，仅可使用一次）：\n${url}\n\n` +
      `Tap to connect your Wiki account (valid for 10 minutes, single use):\n${url}`
    );
  },
  /** Generic hint posted to a group when the actual link went out privately. */
  groupBindHint(): string {
    return (
      '我已私信你绑定 Wiki 账号的链接，请查收。 / ' +
      "I've sent you a private message with a link to connect your Wiki account."
    );
  },
  /** Acknowledge a "start a new conversation" reset command. */
  resetAck(): string {
    return '已开始新的对话。 / Started a new conversation.';
  },
  /** Shown when AI Q&A is disabled at the Wiki level. */
  aiDisabled(): string {
    return (
      '当前 Wiki 未启用 AI 问答功能。 / AI question answering is not enabled on this Wiki.'
    );
  },
  /** Generic "couldn't answer right now" fallback (never leaks details). */
  unavailable(): string {
    return (
      '暂时无法回答这个问题，请稍后再试。 / I could not answer that right now — please try again later.'
    );
  },
  /** Shown when the user exceeds the per-user/per-chat rate limit. */
  rateLimited(): string {
    return '你发送得太频繁了，请稍后再试。 / You are sending messages too quickly — please try again shortly.';
  },
  /** No accessible source material was found for the question. */
  insufficientEvidence(): string {
    return (
      '没有找到你有权限查看的相关内容。 / I could not find any material you have access to for that.'
    );
  },
  /** Welcome shown right after a successful binding confirmation (web page). */
  bindWelcome(displayName: string | null): string {
    const name = displayName ?? '';
    return name
      ? `你好 ${name}，你的 Feishu 已成功绑定 Wiki 账号。 / Hi ${name}, your Feishu is now connected to your Wiki account.`
      : '你的 Feishu 已成功绑定 Wiki 账号。 / Your Feishu is now connected to your Wiki account.';
  },
} as const;
