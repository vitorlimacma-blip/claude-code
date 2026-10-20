export type TableName = 'accounts' | 'categories' | 'budgets' | 'transactions' | 'recurrences' | 'settings';

export type ChangeListener = (tables: ReadonlySet<TableName>) => void;

/**
 * Tiny pub/sub that repositories notify after every write, so screens can
 * re-run their queries. It is storage-agnostic on purpose: a future sync
 * engine or server-backed repository can emit the same events.
 */
export interface ChangeBus {
  emit(...tables: TableName[]): void;
  subscribe(listener: ChangeListener): () => void;
}

export function createChangeBus(): ChangeBus {
  const listeners = new Set<ChangeListener>();
  return {
    emit(...tables) {
      const changed = new Set(tables);
      for (const listener of [...listeners]) listener(changed);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
