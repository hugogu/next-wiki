import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SpaceSettingsPanel, type SpaceSettingsItem } from './SpaceSettingsPanel';

const spaces: SpaceSettingsItem[] = [
  {
    id: 'wiki',
    kind: 'wiki',
    displayName: 'Wiki',
    routePrefix: 'w',
    defaultVisibility: 'public',
    isActive: true,
  },
  {
    id: 'generated',
    kind: 'generated',
    displayName: 'Generated',
    routePrefix: 'g',
    defaultVisibility: 'restricted',
    isActive: false,
  },
];

describe('SpaceSettingsPanel', () => {
  it('shows space configuration in a table with one page-level save action', () => {
    const html = renderToStaticMarkup(<SpaceSettingsPanel initialSpaces={spaces} />);

    expect(html).toContain('<table');
    expect(html).toContain('Save changes');
    expect((html.match(/Save changes/g) ?? [])).toHaveLength(1);
    expect(html).toContain('>Wiki<');
    expect(html).toContain('>Generated<');
    expect(html).toContain('/w');
    expect(html).toContain('/g');
    expect(html).toContain('>Public<');
    expect(html).toContain('>Restricted<');
  });

  it('provides visibility help and an edit action for every row', () => {
    const html = renderToStaticMarkup(<SpaceSettingsPanel initialSpaces={spaces} />);

    expect(html).toContain('Explain new page visibility');
    expect(html).toContain('Public pages are readable without signing in after they are published.');
    expect(html).toContain('aria-label="Edit Wiki"');
    expect(html).toContain('aria-label="Edit Generated"');
  });
});
