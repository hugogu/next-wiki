import type { TransferConversion } from '../registry';

export function convertMarkdown(source: string): TransferConversion {
  return { markdown: source, converted: false };
}
