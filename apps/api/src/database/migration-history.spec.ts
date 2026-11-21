import {
  compareMigrationHistory,
  type AppliedMigration,
  type JournalMigration,
} from './migration-history.js';

const journal: JournalMigration[] = [
  { tag: '0000_extensions', when: 1000, hash: 'h0' },
  { tag: '0001_users', when: 2000, hash: 'h1' },
  { tag: '0002_partners', when: 3000, hash: 'h2' },
];
const applied = (rows: [number, string][]): AppliedMigration[] =>
  rows.map(([createdAt, hash], index) => ({ id: index + 1, createdAt, hash }));

describe('compareMigrationHistory', () => {
  it('sin diferencias si la base tiene las mismas migraciones, en el mismo orden y con el mismo hash', () => {
    expect(
      compareMigrationHistory(
        journal,
        applied([
          [1000, 'h0'],
          [2000, 'h1'],
          [3000, 'h2'],
        ]),
      ),
    ).toEqual([]);
  });

  it('indica la migración que falta aplicar', () => {
    expect(
      compareMigrationHistory(
        journal,
        applied([
          [1000, 'h0'],
          [2000, 'h1'],
        ]),
      ),
    ).toEqual(['Falta aplicar 0002_partners (posición 3).']);
  });

  it('indica la migración cuyo hash no coincide con su SQL', () => {
    expect(
      compareMigrationHistory(
        journal,
        applied([
          [1000, 'h0'],
          [2000, 'otro'],
          [3000, 'h2'],
        ]),
      ),
    ).toEqual([
      'La posición 2 no coincide con 0001_users: la base registra created_at 2000 y hash otro…; el journal espera created_at 2000 y hash h1….',
    ]);
  });

  it('detecta una migración registrada que el journal ya no tiene (renumerada en un rebase)', () => {
    expect(
      compareMigrationHistory(
        journal,
        applied([
          [1000, 'h0'],
          [1500, 'h2'],
          [2000, 'h1'],
          [3000, 'h2'],
        ]),
      ),
    ).toEqual([
      'La posición 2 no coincide con 0001_users: la base registra created_at 1500 y hash h2…; el journal espera created_at 2000 y hash h1…. El SQL registrado corresponde a 0002_partners.',
      'La posición 3 no coincide con 0002_partners: la base registra created_at 2000 y hash h1…; el journal espera created_at 3000 y hash h2…. El SQL registrado corresponde a 0001_users.',
      'La base registra una migración de más en la posición 4 (created_at 3000, hash h2…), que no está en el journal.',
    ]);
  });
});
