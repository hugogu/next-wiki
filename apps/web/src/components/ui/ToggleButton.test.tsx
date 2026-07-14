import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToggleButton } from './ToggleButton';

describe('ToggleButton', () => {
  it('renders related options as one accessible mutually exclusive control', () => {
    const html = renderToStaticMarkup(
      <ToggleButton
        ariaLabel="View mode"
        options={[
          { value: 'source', label: 'Source' },
          { value: 'preview', label: 'Preview' },
        ]}
        value="source"
        onChange={() => undefined}
      />,
    );

    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="View mode"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });
});
