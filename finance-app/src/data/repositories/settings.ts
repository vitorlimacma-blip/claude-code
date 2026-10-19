import { eq } from 'drizzle-orm';
import { type RepositoryContext, timestamp } from '../context';
import { settings } from '../schema';

export function createSettingsRepository(ctx: RepositoryContext) {
  const { db, bus } = ctx;

  return {
    async get<T>(key: string, fallback: T): Promise<T> {
      const row = await db.select().from(settings).where(eq(settings.key, key)).get();
      if (!row) return fallback;
      try {
        return JSON.parse(row.value) as T;
      } catch {
        return fallback;
      }
    },

    async set(key: string, value: unknown): Promise<void> {
      const json = JSON.stringify(value);
      const updatedAt = timestamp(ctx);
      await ctx.write((tx) =>
        tx
          .insert(settings)
          .values({ key, value: json, updatedAt })
          .onConflictDoUpdate({ target: settings.key, set: { value: json, updatedAt } })
      );
      bus.emit('settings');
    },
  };
}

export type SettingsRepository = ReturnType<typeof createSettingsRepository>;
