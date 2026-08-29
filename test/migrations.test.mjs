import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
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
    await applyMigrations({ databasePath, migrationsDirectory }),
    ['001_create_example.sql'],
  )
  assert.deepEqual(
    await applyMigrations({ databasePath, migrationsDirectory }),
    [],
  )

  await writeFile(
    join(migrationsDirectory, '002_fail.sql'),
    [
      'CREATE TABLE partial_state (id INTEGER PRIMARY KEY);',
      'INSERT INTO missing_table (id) VALUES (1);',
    ].join('\n'),
  )

  await assert.rejects(() =>
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

test('a personal migration backs up the database before changing its schema', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'omni-orga-migration-backup-'))
  const migrationsDirectory = join(directory, 'migrations')
  const backupDirectory = join(directory, 'backups')
  const databasePath = join(directory, 'data', 'omni-orga.sqlite')
  await mkdir(migrationsDirectory)

  const database = openDatabase(databasePath)
  database.exec("CREATE TABLE protected_data (value TEXT); INSERT INTO protected_data VALUES ('safe')")
  database.close()
  await writeFile(
    join(migrationsDirectory, '001_change_schema.sql'),
    'CREATE TABLE after_backup (id INTEGER PRIMARY KEY);',
  )

  await applyMigrations({
    databasePath,
    migrationsDirectory,
    backupBeforeMigrations: true,
    backupDirectory,
  })

  const [backupName] = await readdir(backupDirectory)
  const saved = openDatabase(join(backupDirectory, backupName))
  assert.equal(saved.prepare('SELECT value FROM protected_data').get().value, 'safe')
  assert.equal(
    saved.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name = 'after_backup'").get().count,
    0,
  )
  saved.close()

  const migrated = openDatabase(databasePath)
  assert.equal(
    migrated.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name = 'after_backup'").get().count,
    1,
  )
  migrated.close()

  const restoredPath = join(directory, 'restored', 'data', 'omni-orga.sqlite')
  const restore = spawnSync(
    process.execPath,
    ['scripts/restore.mjs', join(backupDirectory, backupName)],
    {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
      env: {
        ...process.env,
        OMNI_ORGA_TEST: '1',
        OMNI_ORGA_DATABASE_PATH: restoredPath,
        OMNI_ORGA_BACKUP_DIRECTORY: join(directory, 'restored', 'backups'),
        OMNI_ORGA_RUNTIME_DIR: join(directory, 'restored', 'runtime'),
      },
      timeout: 30_000,
    },
  )
  assert.equal(restore.status, 0, restore.stderr)
  const restored = openDatabase(restoredPath)
  assert.equal(restored.prepare('SELECT value FROM protected_data').get().value, 'safe')
  restored.close()
})
