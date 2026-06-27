import { clampPage, paginate, totalPages } from './pagination';

describe('totalPages', () => {
  it('returns 1 for an empty list', () => {
    expect(totalPages(0, 20)).toBe(1);
  });

  it('rounds up a partial last page', () => {
    expect(totalPages(21, 20)).toBe(2);
    expect(totalPages(40, 20)).toBe(2);
    expect(totalPages(41, 20)).toBe(3);
  });

  it('guards against a non-positive page size', () => {
    expect(totalPages(100, 0)).toBe(1);
  });
});

describe('clampPage', () => {
  const max = 5;

  it('keeps an in-range page', () => {
    expect(clampPage('3', max)).toBe(3);
  });

  it('clamps zero, negative, and non-numeric to 1', () => {
    expect(clampPage('0', max)).toBe(1);
    expect(clampPage('-3', max)).toBe(1);
    expect(clampPage('abc', max)).toBe(1);
    expect(clampPage('', max)).toBe(1);
    expect(clampPage(undefined, max)).toBe(1);
    expect(clampPage(null, max)).toBe(1);
  });

  it('rejects fractional pages', () => {
    expect(clampPage('2.5', max)).toBe(1);
  });

  it('clamps beyond the last page down to max', () => {
    expect(clampPage('99999', max)).toBe(5);
  });

  it('takes the first value when the param repeats', () => {
    expect(clampPage(['2', '4'], max)).toBe(2);
  });
});

describe('paginate', () => {
  it('computes page/offset/totalPages for an in-range request', () => {
    expect(paginate({ page: '2', pageSize: 20, totalItems: 50 })).toEqual({
      page: 2,
      pageSize: 20,
      offset: 20,
      totalPages: 3,
      totalItems: 50,
    });
  });

  it('clamps an over-last page back to the last page and its offset', () => {
    const result = paginate({ page: '99', pageSize: 20, totalItems: 50 });
    expect(result.page).toBe(3);
    expect(result.offset).toBe(40);
  });

  it('falls back to page 1 / offset 0 for an empty list', () => {
    expect(paginate({ page: 'abc', pageSize: 20, totalItems: 0 })).toEqual({
      page: 1,
      pageSize: 20,
      offset: 0,
      totalPages: 1,
      totalItems: 0,
    });
  });
});
