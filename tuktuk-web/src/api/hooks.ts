import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, useApi } from './client';
import type { LiveStats, LiveVehicle, Me, Vehicle } from './types';

interface AsyncState<T> {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean;
}

/**
 * GET /auth/me
 *
 * This is the authority on role and scope, not the ID token. Asgardeo asserts
 * *who* you are; the Mongo User record decides *what you may see*, because only
 * Mongo knows the Province -> District -> Station graph that scope_id points into.
 */
export function useMe() {
  const api = useApi();
  const [state, setState] = useState<AsyncState<Me>>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    api<Me>('/auth/me')
      .then((res) => {
        if (!cancelled) setState({ data: res.data, error: null, loading: false });
      })
      .catch((error: ApiError) => {
        if (!cancelled) setState({ data: null, error, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return state;
}

export interface LiveFilters {
  online?: 'true' | 'false' | '';
  vehicle_status?: string;
  license_plate?: string;
}

/**
 * Polls GET /live on an interval.
 *
 * Polling rather than websockets because the API has no socket endpoint — the
 * backend only exposes REST. `limit: 200` is the API's hard ceiling
 * (src/utils/pagination.js), so beyond 200 live vehicles this needs paging or a
 * map-bounds filter.
 */
export function useLiveVehicles(filters: LiveFilters = {}, intervalMs = 5000) {
  const api = useApi();
  const [state, setState] = useState<AsyncState<LiveVehicle[]>>({
    data: null,
    error: null,
    loading: true,
  });
  const [total, setTotal] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Keep filters out of the effect's dep array by value-comparing them, so a new
  // object literal on every render doesn't restart the interval.
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;
    const parsed = JSON.parse(filterKey) as LiveFilters;

    const load = async () => {
      try {
        const res = await api<LiveVehicle[]>('/live', {
          query: { limit: 200, ...parsed },
        });
        if (cancelled) return;
        setState({ data: res.data, error: null, loading: false });
        setTotal(res.total ?? res.data.length);
        setLastUpdated(new Date());
      } catch (error) {
        if (cancelled) return;
        // Keep showing the last good positions; surface the error alongside.
        setState((prev) => ({ ...prev, error: error as ApiError, loading: false }));
      }
    };

    void load();
    const id = window.setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [api, filterKey, intervalMs]);

  return { ...state, total, lastUpdated };
}

/** Polls GET /live/stats. */
export function useLiveStats(intervalMs = 15000) {
  const api = useApi();
  const [stats, setStats] = useState<LiveStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api<LiveStats>('/live/stats')
        .then((res) => {
          if (!cancelled) setStats(res.data);
        })
        .catch(() => {
          /* stats are decorative; the map is the source of truth */
        });

    void load();
    const id = window.setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [api, intervalMs]);

  return stats;
}

/** GET /vehicles with search + paging. */
export function useVehicles() {
  const api = useApi();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const res = await api<Vehicle[]>('/vehicles', {
        query: { page, limit: 25, search: search || undefined },
      });
      // Ignore responses from superseded requests so fast typing can't
      // render stale results over fresh ones.
      if (id !== requestId.current) return;
      setVehicles(res.data);
      setPages(res.pages ?? 1);
      setTotal(res.total ?? res.data.length);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err as ApiError);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [api, page, search]);

  useEffect(() => {
    const debounce = window.setTimeout(load, search ? 300 : 0);
    return () => window.clearTimeout(debounce);
  }, [load, search]);

  const updateSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  return {
    vehicles,
    loading,
    error,
    page,
    pages,
    total,
    search,
    setSearch: updateSearch,
    setPage,
    reload: load,
  };
}
