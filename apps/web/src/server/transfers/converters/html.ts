import TurndownService from 'turndown';
import type { TransferConversion } from '../registry';

const service = new TurndownService({
  codeBlockStyle: 'fenced',
  headingStyle: 'atx',
  bulletListMarker: '-',
});
service.addRule('lineBreak', {
  filter: 'br',
  replacement: () => '  \n',
});

export function convertHtml(source: string): TransferConversion {
  const sanitized = source
    .replace(/<(script|style|iframe|object|embed|form)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*(["'])javascript:[\s\S]*?\2/gi, '');
  return { markdown: service.turndown(sanitized), converted: true };
}
