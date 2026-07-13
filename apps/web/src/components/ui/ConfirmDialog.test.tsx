import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '@/i18n/client';
import enMessages from '../../../messages/en.json';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog localization', () => {
  it('uses catalog labels when custom labels are not supplied', () => {
    const html = renderToStaticMarkup(
      <I18nProvider initialLocale="en" messages={enMessages}>
        <ConfirmDialog title="Delete" message="Are you sure?" onConfirm={() => undefined} onCancel={() => undefined} />
      </I18nProvider>,
    );
    expect(html).toContain('>Cancel<');
    expect(html).toContain('>Confirm<');
  });
});
