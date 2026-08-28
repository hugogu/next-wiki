import type { MigrationCandidate } from './source-discovery';

export type MigrationPreview = {
  status: 'preview';
  candidates: Array<Pick<MigrationCandidate, 'relativePath' | 'sourceFingerprint' | 'category' | 'eligible' | 'reason'>>;
  eligibleCount: number;
};

export function buildPreview(candidates: MigrationCandidate[]): MigrationPreview {
  return {
    status: 'preview',
    candidates: candidates.map(({ content: _content, ...candidate }) => candidate),
    eligibleCount: candidates.filter((candidate) => candidate.eligible).length,
  };
}
