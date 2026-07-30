import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AiActionEvent } from '@next-wiki/shared';
import { ApplicationI18nProvider } from '@/components/i18n/ApplicationI18nProvider';
import { getMessages } from '@/i18n/catalog';
import { ScheduledAiJobRunExecution } from './ScheduledAiJobRunExecution';

const id = '00000000-0000-0000-0000-000000000001';

describe('ScheduledAiJobRunExecution', () => {
  it('renders the persisted Wiki AI transcript as a read-only execution view', () => {
    const events: AiActionEvent[] = [
      { id: 1, actionId: id, type: 'question', payload: { text: 'Review the selected Space.' }, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 2, actionId: id, type: 'text_delta', payload: { text: 'Prepared a reviewable proposal.' }, createdAt: '2026-01-01T00:00:01.000Z' },
    ];
    const html = renderToStaticMarkup(<ApplicationI18nProvider initialLocale="en" messages={getMessages('en')}><ScheduledAiJobRunExecution jobId={id} initialRun={{
      id, jobId: id, trigger: 'manual', status: 'completed', scheduledFor: null,
      definitionSnapshot: { version: 1, name: 'Review', taskDescription: 'Review', scheduleCron: '0 3 * * *', timeZone: 'UTC', targetScope: { spaceIds: [id], skillNames: [] }, runAsUserId: id },
      startedAt: null, finishedAt: null, errorCode: null, errorMessage: null, actionId: id,
    }} initialEvents={events} /></ApplicationI18nProvider>);
    expect(html).toContain('Execution');
    expect(html).toContain('Review the selected Space.');
    expect(html).toContain('Prepared a reviewable proposal.');
    expect(html).not.toContain('Stop run');
  });
});
