// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  it('uses the browser-native title tooltip', () => {
    const html = renderToStaticMarkup(
      <Tooltip label="New session">
        <button type="button">+</button>
      </Tooltip>,
    );

    expect(html).toContain('title="New session"');
    expect(html).not.toContain('role="tooltip"');
    expect(html).not.toContain('group-hover');
  });
});
