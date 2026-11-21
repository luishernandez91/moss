import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { Database } from '../database/database.module.js';
import { CATALOG_WRITE_LOCK, catalogWrite } from './catalog-write.js';

it('adquiere el bloqueo compartido antes de ejecutar la escritura dentro de la transacción', async () => {
  const events: string[] = [];
  const tx = {
    execute: (query: SQL) => {
      const compiled = new PgDialect().sqlToQuery(query);
      expect(compiled.sql).toBe('SELECT pg_advisory_xact_lock($1, $2)');
      expect(compiled.params).toEqual([CATALOG_WRITE_LOCK.namespace, CATALOG_WRITE_LOCK.key]);
      events.push('lock');
      return Promise.resolve();
    },
  };
  const db = {
    transaction: async (action: (transaction: typeof tx) => Promise<string>) => {
      events.push('begin');
      const result = await action(tx);
      events.push('commit');
      return result;
    },
  } as unknown as Database;
  await expect(
    catalogWrite(db, (transaction) => {
      expect(transaction).toBe(tx);
      events.push('write');
      return Promise.resolve('ok');
    }),
  ).resolves.toBe('ok');
  expect(events).toEqual(['begin', 'lock', 'write', 'commit']);
});
