export type TransferConversion = {
  markdown: string;
  converted: boolean;
};

export type TransferConverter = (source: string) => TransferConversion;

const converters = new Map<string, TransferConverter>();

export function registerTransferConverter(keys: string[], converter: TransferConverter): void {
  for (const key of keys) converters.set(key.toLowerCase(), converter);
}

export function getTransferConverter(contentType?: string | null, editor?: string | null) {
  return converters.get((editor ?? '').toLowerCase()) ??
    converters.get((contentType ?? '').toLowerCase()) ??
    null;
}

export type TransferSourceAdapter = {
  type: 'wikijs';
};

const sourceAdapters = new Map<string, TransferSourceAdapter>();

export function registerTransferSourceAdapter(adapter: TransferSourceAdapter): void {
  sourceAdapters.set(adapter.type, adapter);
}

export function getTransferSourceAdapter(type: string): TransferSourceAdapter {
  const adapter = sourceAdapters.get(type);
  if (!adapter) throw new Error(`Unsupported transfer source type: ${type}`);
  return adapter;
}

import { convertMarkdown } from './converters/markdown';
import { convertHtml } from './converters/html';

registerTransferConverter(['text/markdown', 'markdown'], convertMarkdown);
registerTransferConverter(['text/html', 'ckeditor'], convertHtml);
registerTransferSourceAdapter({ type: 'wikijs' });
