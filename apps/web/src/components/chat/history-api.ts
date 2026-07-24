import type { AiConversationDetail } from '@next-wiki/shared';
import { apiGet } from '@/lib/api/client';

export async function fetchHistoryDetail(id: string): Promise<AiConversationDetail | null> {
  try {
    return await apiGet<AiConversationDetail>(`/api/ai/sessions/${encodeURIComponent(id)}`);
  } catch {
    return null;
  }
}
