/**
 * `pnpm db:verify`: compara las migraciones registradas en `drizzle.__drizzle_migrations` contra el
 * journal de Drizzle. Drizzle solo aplica migraciones con `when` posterior a la última registrada,
 * así que una base migrada antes de un rebase que renumeró migraciones puede saltarse una sin error.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export interface JournalMigration {
  tag: string;
  /** `when` del journal; Drizzle lo guarda como `created_at`. */
  when: number;
  /** sha256 del SQL completo del archivo, como lo calcula el migrador de Drizzle. */
  hash: string;
}

export interface AppliedMigration {
  id: number;
  createdAt: number;
  hash: string;
}

const short = (hash: string) => `${hash.slice(0, 12)}…`;

/** Lee el journal y calcula el hash de cada `.sql` igual que `drizzle-orm/migrator`. */
export function readJournal(migrationsFolder: string): JournalMigration[] {
  const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, 'utf8')) as {
    entries: { tag: string; when: number }[];
  };
  return journal.entries.map((entry) => ({
    tag: entry.tag,
    when: entry.when,
    hash: createHash('sha256')
      .update(readFileSync(`${migrationsFolder}/${entry.tag}.sql`).toString())
      .digest('hex'),
  }));
}

/**
 * Lista de diferencias, vacía si la base tiene exactamente las migraciones del journal en el
 * mismo orden y con el mismo hash. `applied` va en orden de `id`.
 */
export function compareMigrationHistory(
  journal: readonly JournalMigration[],
  applied: readonly AppliedMigration[],
): string[] {
  const problems: string[] = [];
  for (let index = 0; index < Math.max(journal.length, applied.length); index += 1) {
    const expected = journal[index];
    const actual = applied[index];
    const position = index + 1;
    if (!actual) {
      problems.push(`Falta aplicar ${expected!.tag} (posición ${position}).`);
      continue;
    }
    if (!expected) {
      problems.push(
        `La base registra una migración de más en la posición ${position} (created_at ${actual.createdAt}, hash ${short(actual.hash)}), que no está en el journal.`,
      );
      continue;
    }
    if (actual.createdAt === expected.when && actual.hash === expected.hash) continue;
    const owner = journal.find((entry) => entry.hash === actual.hash);
    problems.push(
      `La posición ${position} no coincide con ${expected.tag}: la base registra created_at ${actual.createdAt} y hash ${short(actual.hash)}; el journal espera created_at ${expected.when} y hash ${short(expected.hash)}.` +
        (owner && owner.tag !== expected.tag
          ? ` El SQL registrado corresponde a ${owner.tag}.`
          : ''),
    );
  }
  return problems;
}
