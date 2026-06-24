'use client';

import { useTranslation } from '@/i18n/client';

const CODE_SAMPLE = `function greet(name) {
  return \`Hello, \${name}\`;
}`;

/**
 * Shared `.prose` sample used by both the system-appearance preview and the
 * Markdown-theme preview. Renders the common Markdown elements (headings,
 * paragraph + link, blockquote, code block, list, table) so a previewer can
 * show exactly how rendered content looks under the current tokens/theme.
 */
export function ProsePreviewSample() {
  const { t } = useTranslation();
  return (
    <article className="prose max-w-none">
      <h1>{t('admin.appearance.preview.heading')}</h1>
      <p>
        {t('admin.appearance.preview.body')}{' '}
        <a href="#" onClick={(e) => e.preventDefault()}>
          {t('admin.appearance.preview.link')}
        </a>
        .
      </p>

      <h2>{t('admin.appearance.preview.subheading')}</h2>
      <blockquote>{t('admin.appearance.preview.quote')}</blockquote>
      <pre>
        <code>{CODE_SAMPLE}</code>
      </pre>

      <h3>{t('admin.appearance.preview.h3')}</h3>
      <ul>
        <li>{t('admin.appearance.preview.listItem')}</li>
        <li>{t('admin.appearance.preview.listItemAlt')}</li>
      </ul>
      <table>
        <thead>
          <tr>
            <th>{t('admin.appearance.preview.table.token')}</th>
            <th>{t('admin.appearance.preview.table.value')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="font-mono">h1</td>
            <td className="font-mono">2rem</td>
          </tr>
          <tr>
            <td className="font-mono">code</td>
            <td className="font-mono">mono</td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}
