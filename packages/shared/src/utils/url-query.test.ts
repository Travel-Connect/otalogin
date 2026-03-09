import { describe, it, expect } from 'vitest';
import {
  sanitizeQueryParams,
  extractAndSanitizeQuery,
  buildQueryString,
  buildFullUrl,
  QUERY_DENYLIST,
} from './url-query';

describe('sanitizeQueryParams', () => {
  it('should pass through safe params', () => {
    const result = sanitizeQueryParams({ page: '1', sort: 'name' });
    expect(result).toEqual({ page: '1', sort: 'name' });
  });

  it('should remove denied keys (case insensitive)', () => {
    const result = sanitizeQueryParams({
      page: '1',
      token: 'abc',
      Token: 'def',
      ACCESS_TOKEN: 'xyz',
    });
    expect(result).toEqual({ page: '1' });
  });

  it('should remove all denylist entries', () => {
    const input: Record<string, string> = {};
    for (const key of QUERY_DENYLIST) {
      input[key] = 'value';
    }
    input['safe_key'] = 'ok';
    const result = sanitizeQueryParams(input);
    expect(result).toEqual({ safe_key: 'ok' });
  });

  it('should return empty object when all keys are denied', () => {
    const result = sanitizeQueryParams({ token: 'x', session: 'y' });
    expect(result).toEqual({});
  });

  it('should handle empty input', () => {
    expect(sanitizeQueryParams({})).toEqual({});
  });
});

describe('extractAndSanitizeQuery', () => {
  it('should extract and sanitize query from allowed domain', () => {
    const result = extractAndSanitizeQuery(
      'https://www.jalan.net/page?sort=asc&page=2&token=secret',
      ['jalan.net']
    );
    expect(result).toEqual({ sort: 'asc', page: '2' });
  });

  it('should match subdomains', () => {
    const result = extractAndSanitizeQuery(
      'https://wwws.jalan.net/path?foo=bar',
      ['jalan.net']
    );
    expect(result).toEqual({ foo: 'bar' });
  });

  it('should return null for disallowed domain', () => {
    const result = extractAndSanitizeQuery(
      'https://evil.com/page?sort=asc',
      ['jalan.net']
    );
    expect(result).toBeNull();
  });

  it('should return null for invalid URL', () => {
    const result = extractAndSanitizeQuery('not-a-url', ['jalan.net']);
    expect(result).toBeNull();
  });

  it('should return empty object when URL has no query params', () => {
    const result = extractAndSanitizeQuery(
      'https://www.jalan.net/path',
      ['jalan.net']
    );
    expect(result).toEqual({});
  });
});

describe('buildQueryString', () => {
  it('should build a query string from params', () => {
    const result = buildQueryString({ page: '1', sort: 'name' });
    expect(result).toBe('page=1&sort=name');
  });

  it('should encode special characters', () => {
    const result = buildQueryString({ q: 'hello world' });
    expect(result).toBe('q=hello+world');
  });

  it('should handle empty params', () => {
    expect(buildQueryString({})).toBe('');
  });
});

describe('buildFullUrl', () => {
  it('should append query to base URL', () => {
    const result = buildFullUrl('https://example.com/page', { page: '1' });
    expect(result).toBe('https://example.com/page?page=1');
  });

  it('should use & when base URL already has query', () => {
    const result = buildFullUrl('https://example.com/page?existing=1', { page: '2' });
    expect(result).toBe('https://example.com/page?existing=1&page=2');
  });

  it('should return base URL when query is null', () => {
    expect(buildFullUrl('https://example.com', null)).toBe('https://example.com');
  });

  it('should return base URL when query is empty', () => {
    expect(buildFullUrl('https://example.com', {})).toBe('https://example.com');
  });
});
