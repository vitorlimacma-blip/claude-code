import { useCallback, useEffect, useState } from 'react';
import type { TableName } from '../data/changes';
import type { Repositories } from '../data/repositories';
import { useRepositories } from './DataProvider';

export interface QueryResult<T> {
  /** Undefined until the first load finishes; afterwards keeps the last result while refreshing. */
  data: T | undefined;
  error: Error | null;
  refresh: () => void;
}

/**
 * Runs `query` against the repositories and re-runs it whenever one of
 * `tables` changes (or when `deps` change), so screens stay current without
 * manual refreshes.
 *
 *   const { data } = useQuery((r) => r.transactions.list({ from }), ['transactions'], [from]);
 */
export function useQuery<T>(
  query: (repos: Repositories) => Promise<T>,
  tables: TableName[],
  deps: unknown[] = []
): QueryResult<T> {
  const repos = useRepositories();
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ data: T | undefined; error: Error | null }>({
    data: undefined,
    error: null,
  });

  const tablesKey = tables.join(',');
  useEffect(() => {
    const watched = new Set(tablesKey.split(','));
    return repos.subscribe((changed) => {
      if ([...changed].some((t) => watched.has(t))) setVersion((v) => v + 1);
    });
  }, [repos, tablesKey]);

  useEffect(() => {
    let cancelled = false; // ignore results of a run superseded by a newer one
    query(repos).then(
      (data) => !cancelled && setResult({ data, error: null }),
      (error: Error) => !cancelled && setResult((prev) => ({ data: prev.data, error }))
    );
    return () => {
      cancelled = true;
    };
    // `query` is a new closure every render; `deps` lists what it actually depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos, version, ...deps]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  return { ...result, refresh };
}
