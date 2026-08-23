'use client';

/**
 * The selected conversation as an address, not just tab state.
 *
 * The chat's own state lives in sessionStorage, which makes a conversation
 * impossible to point at: you cannot bookmark it, reopen it in another tab, or
 * send someone the thread you are asking about. Selecting a conversation
 * therefore stamps `?chat=<conversationKey>` onto whatever page the pane is
 * open over — the page stays the address, the conversation rides along with it.
 * It rides only while the pane is showing: collapsing it drops the parameter,
 * so the address never advertises a conversation that is not on screen.
 *
 * `history.replaceState` (rather than the Next router) keeps this a pure
 * address-bar update: no RSC round-trip, no scroll reset, and no history entry
 * per click while browsing through past conversations.
 */
export const CHAT_URL_PARAM = 'chat';

export function readChatKeyFromUrl(search: string): string | null {
  const key = new URLSearchParams(search).get(CHAT_URL_PARAM);
  return key ? key : null;
}

let arrivalConsumed = false;

/**
 * The conversation this document arrived pointing at, handed out once.
 *
 * Arriving on a link is an event, not a state: the pane remounts every time
 * the layout switches between docked and maximized, and replaying the arrival
 * on each remount would make collapsing the pane reopen it from its own
 * parameter. Module state, so it resets with the document — which is also the
 * only way a `?chat=` link is opened.
 */
export function takeArrivalChatKey(): string | null {
  if (arrivalConsumed || typeof window === 'undefined') return null;
  arrivalConsumed = true;
  return readChatKeyFromUrl(window.location.search);
}

/** Pure form of the address update, so the rule is testable without a window. */
export function chatUrlWithKey(href: string, key: string | null): string {
  const url = new URL(href);
  if (key) {
    url.searchParams.set(CHAT_URL_PARAM, key);
  } else {
    url.searchParams.delete(CHAT_URL_PARAM);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function syncChatKeyToUrl(key: string | null): void {
  if (typeof window === 'undefined') return;
  const next = chatUrlWithKey(window.location.href, key);
  if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
  window.history.replaceState(window.history.state, '', next);
}
