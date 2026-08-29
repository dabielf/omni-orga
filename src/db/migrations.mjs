import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DatabaseSync } from 'node:sqlite'

import { createBackup } from './backups.mjs'

export const projectRoot = fileURLToPath(new URL('../..', import.meta.url))
export const defaultDatabasePath = join(projectRoot, 'data', 'omni-orga.sqlite')
export const defaultMigrationsDirectory = join(projectRoot, 'migrations')

export function openDatabase(databasePath = defaultDatabasePath) {
  mkdirSync(dirname(databasePath), { recursive: true })

  const database = new DatabaseSync(databasePath, { timeout: 5_000 })
  database.exec('PRAGMA journal_mode = WAL')
  database.exec('PRAGMA busy_timeout = 5000')
  database.exec('PRAGMA foreign_keys = ON')
  return database
}

function appliedMigrationNames(databasePath) {
  if (!existsSync(databasePath)) return []

  const database = new DatabaseSync(databasePath, { readOnly: true })
  try {
    const table = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
      .get()
    if (!table) return []
    return database
      .prepare('SELECT name FROM schema_migrations')
      .all()
      .map(({ name }) => name)
  } finally {
    database.close()
  }
}

export async function applyMigrations({
  databasePath = defaultDatabasePath,
  migrationsDirectory = defaultMigrationsDirectory,
  backupBeforeMigrations = databasePath === defaultDatabasePath,
  backupDirectory,
} = {}) {
  const databaseExisted = existsSync(databasePath)
  const applied = new Set(appliedMigrationNames(databasePath))
  const pending = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql') && !applied.has(name))
    .sort()

  if (!pending.length) return []
  if (backupBeforeMigrations && databaseExisted) {
    await createBackup({ databasePath, backupDirectory, kind: 'migration' })
  }

  const database = openDatabase(databasePath)
  try {
    for (const name of pending) {
      database.exec('BEGIN IMMEDIATE')
      try {
        database.exec(`
          CREATE TABLE IF NOT EXISTS schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          ) STRICT
        `)
        database.exec(readFileSync(join(migrationsDirectory, name), 'utf8'))
        database.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name)
        database.exec('COMMIT')
      } catch (error) {
        database.exec('ROLLBACK')
        throw new Error(`Migration ${name} failed`, { cause: error })
      }
    }

    return pending
  } finally {
    database.close()
  }
}
