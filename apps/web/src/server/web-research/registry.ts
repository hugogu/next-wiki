import type { WebResearchConnector } from './types';
import { tavilyConnector } from './tavily';

const connectors: Record<string, WebResearchConnector> = { tavily: tavilyConnector };

export function getWebResearchConnector(id: string | null | undefined): WebResearchConnector | null {
  return id ? (connectors[id] ?? null) : null;
}
