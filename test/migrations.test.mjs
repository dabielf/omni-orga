import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { applyMigrations, openDatabase } from '../src/db/migrations.mjs'

test('migrations apply once and a failed migration rolls back', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'omni-orga-migrations-'))
  const migrationsDirectory = join(directory, 'migrations')
  const databasePath = join(directory, 'omni-orga.sqlite')

  await mkdir(migrationsDirectory)
  await writeFile(
    join(migrationsDirectory, '001_create_example.sql'),
    'CREATE TABLE example (id INTEGER PRIMARY KEY);',
  )

  assert.deepEqual(
    applyMigrations({ databasePath, migrationsDirectory }),
    ['001_create_example.sql'],
  )
  assert.deepEqual(
    applyMigrations({ databasePath, migrationsDirectory }),
    [],
  )

  await writeFile(
    join(migrationsDirectory, '002_fail.sql'),
    [
      'CREATE TABLE partial_state (id INTEGER PRIMARY KEY);',
      'INSERT INTO missing_table (id) VALUES (1);',
    ].join('\n'),
  )

  assert.throws(() =>
    applyMigrations({ databasePath, migrationsDirectory }),
  )

  const database = openDatabase(databasePath)
  const applied = database
    .prepare('SELECT name FROM schema_migrations ORDER BY name')
    .all()
    .map(({ name }) => name)
  const partialTable = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get('partial_state')

  assert.deepEqual(applied, ['001_create_example.sql'])
  assert.equal(partialTable, undefined)
  assert.equal(
    database.prepare('PRAGMA journal_mode').get().journal_mode,
    'wal',
  )
  assert.equal(
    database.prepare('PRAGMA busy_timeout').get().timeout,
    5000,
  )
  database.close()

})
