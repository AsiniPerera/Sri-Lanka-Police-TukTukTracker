/**
 * Unit tests for src/utils/pagination.js
 */
const { getPagination, getSort } = require('../../src/utils/pagination');

describe('getPagination()', () => {
  it('returns defaults when query is empty', () => {
    expect(getPagination({})).toEqual({ page: 1, limit: 25, skip: 0 });
  });

  it('parses page and limit from query', () => {
    const result = getPagination({ page: '3', limit: '10' });
    expect(result).toEqual({ page: 3, limit: 10, skip: 20 });
  });

  it('clamps page to minimum 1', () => {
    expect(getPagination({ page: '-5' }).page).toBe(1);
    expect(getPagination({ page: '0' }).page).toBe(1);
  });

  it('clamps limit to minimum 1 for negative values', () => {
    // parseInt('-1') is truthy (-1 !== 0), so Math.max(1, -1) = 1
    expect(getPagination({ limit: '-1' }).limit).toBe(1);
  });

  it('falls back to default limit (25) when limit is 0', () => {
    // parseInt('0') || 25 evaluates to 25 because 0 is falsy
    expect(getPagination({ limit: '0' }).limit).toBe(25);
  });

  it('clamps limit to maximum 200', () => {
    expect(getPagination({ limit: '9999' }).limit).toBe(200);
  });

  it('handles non-numeric values gracefully', () => {
    const result = getPagination({ page: 'abc', limit: 'xyz' });
    expect(result).toEqual({ page: 1, limit: 25, skip: 0 });
  });
});

describe('getSort()', () => {
  it('returns the default sort when no string provided', () => {
    expect(getSort(undefined)).toEqual({ createdAt: -1 });
  });

  it('returns a custom default sort', () => {
    expect(getSort(undefined, { name: 1 })).toEqual({ name: 1 });
  });

  it('parses a single asc field', () => {
    expect(getSort('name:asc')).toEqual({ name: 1 });
  });

  it('parses a single desc field', () => {
    expect(getSort('createdAt:desc')).toEqual({ createdAt: -1 });
  });

  it('parses multiple fields', () => {
    expect(getSort('name:asc,createdAt:desc')).toEqual({ name: 1, createdAt: -1 });
  });

  it('treats unknown direction as desc', () => {
    expect(getSort('name:random')).toEqual({ name: -1 });
  });

  it('returns default sort when string is empty', () => {
    expect(getSort('')).toEqual({ createdAt: -1 });
  });
});
