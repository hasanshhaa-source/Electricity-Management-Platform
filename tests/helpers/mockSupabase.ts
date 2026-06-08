/**
 * In-memory Supabase mock for integration tests.
 * Simulates the query builder chain without a real database.
 */
import { vi } from 'vitest';

export type MockTable = Record<string, unknown>[];

export class MockQueryBuilder {
  private _data: unknown = null;
  private _error: unknown = null;

  constructor(data: unknown, error?: unknown) {
    this._data = data;
    this._error = error ?? null;
  }

  select(_cols?: string) { return this; }
  eq(_col: string, _val: unknown) { return this; }
  neq(_col: string, _val: unknown) { return this; }
  in(_col: string, _vals: unknown[]) { return this; }
  is(_col: string, _val: unknown) { return this; }
  gte(_col: string, _val: unknown) { return this; }
  lte(_col: string, _val: unknown) { return this; }
  order(_col: string, _opts?: unknown) { return this; }
  limit(_n: number) { return this; }
  maybeSingle() { return Promise.resolve({ data: Array.isArray(this._data) ? (this._data as unknown[])[0] ?? null : this._data, error: this._error }); }
  single()      { return Promise.resolve({ data: Array.isArray(this._data) ? (this._data as unknown[])[0] ?? null : this._data, error: this._error }); }
  insert(_row: unknown) { return this; }
  update(_row: unknown) { return this; }
  delete()      { return this; }

  then(resolve: (v: { data: unknown; error: unknown }) => unknown) {
    return Promise.resolve({ data: this._data, error: this._error }).then(resolve);
  }
}

export function createMockSupabase(tables: Record<string, unknown>) {
  const client = {
    from: vi.fn((table: string) => {
      const data = tables[table] ?? null;
      return new MockQueryBuilder(data);
    }),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
    },
  };
  return client;
}
