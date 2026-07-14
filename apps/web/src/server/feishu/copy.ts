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
  /** Welcome shown right after a successful binding confirmation (web page). */
  bindWelcome(displayName: string | null): string {
    const name = displayName ?? '';
    return name
      ? `你好 ${name}，你的 Feishu 已成功绑定 Wiki 账号。 / Hi ${name}, your Feishu is now connected to your Wiki account.`
      : '你的 Feishu 已成功绑定 Wiki 账号。 / Your Feishu is now connected to your Wiki account.';
  },
} as const;
