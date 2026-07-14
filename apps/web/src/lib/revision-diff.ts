import { diffArrays } from 'diff';

export type SourceLine = { number: number; text: string; compareKey: string };
export type DiffKind = 'unchanged' | 'added' | 'removed' | 'changed';
export type DiffRow = { left?: SourceLine; right?: SourceLine; kind: DiffKind } | { kind: 'collapsed'; leftRange: string; rightRange: string };

export function tokenizeSource(source: string, ignoreWhitespace = false): SourceLine[] {
  const lines = source === '' ? [] : source.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  const tokens = lines.map((text, index) => ({ number: index + 1, text, compareKey: ignoreWhitespace ? text.replace(/\s/g, '') : text }));
  return ignoreWhitespace ? tokens.filter((line) => line.compareKey !== '') : tokens;
}

export function buildDiffRows(before: string, after: string, ignoreWhitespace = false): DiffRow[] {
  const left = tokenizeSource(before, ignoreWhitespace);
  const right = tokenizeSource(after, ignoreWhitespace);
  const changes = diffArrays(left, right, { comparator: (a, b) => a.compareKey === b.compareKey });
  const rows: DiffRow[] = [];
  for (let index = 0; index < changes.length; index += 1) {
    const change = changes[index]!;
    const values = change.value as SourceLine[];
    if (!change.added && !change.removed) {
      values.forEach((line, lineIndex) => rows.push({ left: left.find((item) => item.number === line.number) ?? line, right: right.find((item) => item.compareKey === line.compareKey && item.number >= (lineIndex + 1)) ?? line, kind: 'unchanged' }));
      continue;
    }
    const next = changes[index + 1];
    if (change.removed && next?.added) {
      const added = next.value as SourceLine[];
      const shared = Math.min(values.length, added.length);
      for (let i = 0; i < shared; i += 1) rows.push({ left: values[i], right: added[i], kind: 'changed' });
      values.slice(shared).forEach((line) => rows.push({ left: line, kind: 'removed' }));
      added.slice(shared).forEach((line) => rows.push({ right: line, kind: 'added' }));
      index += 1;
    } else if (change.added && next?.removed) {
      const removed = next.value as SourceLine[];
      const shared = Math.min(values.length, removed.length);
      for (let i = 0; i < shared; i += 1) rows.push({ left: removed[i], right: values[i], kind: 'changed' });
      removed.slice(shared).forEach((line) => rows.push({ left: line, kind: 'removed' }));
      values.slice(shared).forEach((line) => rows.push({ right: line, kind: 'added' }));
      index += 1;
    } else if (change.removed) values.forEach((line) => rows.push({ left: line, kind: 'removed' }));
    else values.forEach((line) => rows.push({ right: line, kind: 'added' }));
  }
  return rows;
}

function range(rows: Array<Extract<DiffRow, { kind: Exclude<DiffKind, 'collapsed'> }>>): { leftRange: string; rightRange: string } {
  const side = (key: 'left' | 'right') => {
    const numbers = rows.flatMap((row) => row[key] ? [row[key].number] : []);
    return numbers.length ? `${numbers[0]}-${numbers[numbers.length - 1]}` : '—';
  };
  return { leftRange: side('left'), rightRange: side('right') };
}

export function withContext(rows: DiffRow[], context: number | 'full'): DiffRow[] {
  if (context === 'full') return rows;
  const changed = rows.map((row, index) => row.kind !== 'unchanged' ? index : -1).filter((index) => index >= 0);
  if (changed.length === 0) return rows;
  const visible = new Set<number>();
  changed.forEach((index) => { for (let i = Math.max(0, index - context); i <= Math.min(rows.length - 1, index + context); i += 1) visible.add(i); });
  const output: DiffRow[] = [];
  let hidden: Array<Extract<DiffRow, { kind: Exclude<DiffKind, 'collapsed'> }>> = [];
  rows.forEach((row, index) => {
    if (visible.has(index)) {
      if (hidden.length) { output.push({ kind: 'collapsed', ...range(hidden) }); hidden = []; }
      output.push(row);
    } else hidden.push(row as Extract<DiffRow, { kind: Exclude<DiffKind, 'collapsed'> }>);
  });
  if (hidden.length) output.push({ kind: 'collapsed', ...range(hidden) });
  return output;
}

export function changedLineNumbers(rows: DiffRow[]): { left: Set<number>; right: Set<number> } {
  const left = new Set<number>(); const right = new Set<number>();
  rows.forEach((row) => { if (row.kind !== 'unchanged' && row.kind !== 'collapsed') { if (row.left) left.add(row.left.number); if (row.right) right.add(row.right.number); } });
  return { left, right };
}
