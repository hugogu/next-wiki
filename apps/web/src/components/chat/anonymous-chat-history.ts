'use client';

import type { AiQuestionMode } from '@next-wiki/shared';
import type { ChatMessage } from './chat-store';

const DATABASE_NAME = 'next-wiki';
const DATABASE_VERSION = 1;
const SESSIONS_STORE = 'anonymous-ai-chat-sessions';
const META_STORE = 'anonymous-ai-chat-meta';
const PROBE_KEY = 'storage-probe';

export type AnonymousChatHistoryStatus = 'checking' | 'available' | 'unavailable';

export type AnonymousChatSession = {
  sessionId: string;
  mode: AiQuestionMode;
  messages: ChatMessage[];
  latestQueuedAt?: string;
  updatedAt: string;
};

let status: AnonymousChatHistoryStatus = 'checking';
let databasePromise: Promise<IDBDatabase> | null = null;
const fallbackSessions = new Map<string, AnonymousChatSession>();
const listeners = new Set<(next: AnonymousChatHistoryStatus) => void>();

function setStatus(next: AnonymousChatHistoryStatus) {
  if (status === next) return;
  status = next;
  listeners.forEach((listener) => listener(next));
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB is unavailable'));
  }
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(SESSIONS_STORE)) {
          database.createObjectStore(SESSIONS_STORE, { keyPath: 'sessionId' });
        }
        if (!database.objectStoreNames.contains(META_STORE)) {
          database.createObjectStore(META_STORE, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB could not be opened'));
      request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
    });
  }
  return databasePromise;
}

async function withDatabase<T>(operation: (database: IDBDatabase) => Promise<T>): Promise<T | null> {
  try {
    const value = await operation(await openDatabase());
    setStatus('available');
    return value;
  } catch {
    databasePromise = null;
    setStatus('unavailable');
    return null;
  }
}

/**
 * Browser privacy modes deliberately do not expose a reliable "incognito"
 * signal. A real write is therefore the only safe capability check.
 */
export async function probeAnonymousChatHistory(): Promise<AnonymousChatHistoryStatus> {
  const result = await withDatabase(async (database) => {
    const transaction = database.transaction(META_STORE, 'readwrite');
    transaction.objectStore(META_STORE).put({ key: PROBE_KEY, checkedAt: Date.now() });
    await transactionDone(transaction);
  });
  if (result === null && status !== 'available') setStatus('unavailable');
  return status;
}

export function getAnonymousChatHistoryStatus(): AnonymousChatHistoryStatus {
  return status;
}

export function subscribeAnonymousChatHistoryStatus(
  listener: (next: AnonymousChatHistoryStatus) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function saveAnonymousChatSession(session: Omit<AnonymousChatSession, 'updatedAt'>): Promise<void> {
  const stored = { ...session, updatedAt: new Date().toISOString() };
  fallbackSessions.set(stored.sessionId, stored);
  await withDatabase(async (database) => {
    const transaction = database.transaction(SESSIONS_STORE, 'readwrite');
    transaction.objectStore(SESSIONS_STORE).put(stored);
    await transactionDone(transaction);
  });
}

export async function listAnonymousChatSessions(): Promise<AnonymousChatSession[]> {
  const sessions = await withDatabase(async (database) => {
    const transaction = database.transaction(SESSIONS_STORE, 'readonly');
    const rows = await requestResult(transaction.objectStore(SESSIONS_STORE).getAll());
    await transactionDone(transaction);
    return rows as AnonymousChatSession[];
  });
  const rows = sessions ?? [...fallbackSessions.values()];
  return rows.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function deleteAnonymousChatSession(sessionId: string): Promise<void> {
  fallbackSessions.delete(sessionId);
  await withDatabase(async (database) => {
    const transaction = database.transaction(SESSIONS_STORE, 'readwrite');
    transaction.objectStore(SESSIONS_STORE).delete(sessionId);
    await transactionDone(transaction);
  });
}

/** Removes the device-local anonymous copy after its server actions are claimed at registration. */
export async function clearAnonymousChatHistory(): Promise<void> {
  fallbackSessions.clear();
  await withDatabase(async (database) => {
    const transaction = database.transaction(SESSIONS_STORE, 'readwrite');
    transaction.objectStore(SESSIONS_STORE).clear();
    await transactionDone(transaction);
  });
}
