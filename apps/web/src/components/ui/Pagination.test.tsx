// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';
import { Pagination, buildPageHref, pageWindow } from './Pagination';

// The component reads the current URL from next/navigation and labels from the
// i18n client; stub both so it can render in isolation.
let currentParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/list',
  useSearchParams: () => currentParams,
}));
vi.mock('@/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function render(props: Parameters<typeof Pagination>[0]) {
  return renderToStaticMarkup(<Pagination {...props} />);
}

beforeEach(() => {
  currentParams = new URLSearchParams();
});

describe('buildPageHref', () => {
  it('sets the page param while preserving other params', () => {
    const href = buildPageHref('/list', new URLSearchParams('q=foo&tab=all'), 'page', 3);
    expect(href).toBe('/list?q=foo&tab=all&page=3');
  });

  it('overwrites an existing page param', () => {
    const href = buildPageHref('/list', new URLSearchParams('page=2'), 'page', 5);
    expect(href).toBe('/list?page=5');
  });

  it('honours a custom page param name', () => {
    const href = buildPageHref('/list', new URLSearchParams(), 'p', 2);
    expect(href).toBe('/list?p=2');
  });
});

describe('pageWindow', () => {
  it('centres on the current page', () => {
    expect(pageWindow(5, 10)).toEqual([3, 4, 5, 6, 7]);
  });

  it('clamps to the start', () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, 3]);
  });

  it('clamps to the end', () => {
    expect(pageWindow(10, 10)).toEqual([8, 9, 10]);
  });
});

describe('<Pagination>', () => {
  it('renders nothing for a single-page list', () => {
    expect(render({ currentPage: 1, totalPages: 1 })).toBe('');
  });

  it('renders nothing for an empty list', () => {
    expect(render({ currentPage: 1, totalPages: 0 })).toBe('');
  });

  it('disables first/previous on page 1', () => {
    const html = render({ currentPage: 1, totalPages: 5 });
    expect(html).toContain('aria-disabled="true"');
    // First and Previous are the disabled controls.
    expect(html).toContain('aria-label="pagination.first"');
    expect(html).toContain('aria-label="pagination.previous"');
    // Next/Last are real links.
    expect(html).toContain('href="/admin/list?page=2"');
    expect(html).toContain('href="/admin/list?page=5"');
  });

  it('disables next/last on the last page', () => {
    const html = render({ currentPage: 5, totalPages: 5 });
    expect(html).toContain('href="/admin/list?page=1"'); // First
    expect(html).toContain('href="/admin/list?page=4"'); // Previous
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-label="pagination.next"');
    expect(html).toContain('aria-label="pagination.last"');
  });

  it('preserves other query params in every link', () => {
    currentParams = new URLSearchParams('q=foo');
    const html = render({ currentPage: 2, totalPages: 5 });
    expect(html).toContain('href="/admin/list?q=foo&amp;page=1"');
    expect(html).toContain('href="/admin/list?q=foo&amp;page=3"');
  });

  it('marks the current page', () => {
    const html = render({ currentPage: 3, totalPages: 5 });
    expect(html).toContain('aria-current="page"');
  });
});
