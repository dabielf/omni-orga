import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'

import { backup, DatabaseSync } from 'node:sqlite'

export function defaultBackupDirectory(databasePath) {
  return join(dirname(dirname(databasePath)), 'backups')
}

export function validateDatabase(databasePath) {
  const database = new DatabaseSync(databasePath, { readOnly: true })
  try {
    if (database.prepare('PRAGMA quick_check').get().quick_check !== 'ok') {
      throw new Error('SQLite integrity check failed')
    }
  } finally {
    database.close()
  }
}

export async function createBackup({
  databasePath,
  backupDirectory = defaultBackupDirectory(databasePath),
  kind = 'backup',
} = {}) {
  if (!databasePath || !existsSync(databasePath)) {
    throw new Error(`Database does not exist: ${databasePath ?? '(missing path)'}`)
  }

  await mkdir(backupDirectory, { recursive: true })
  const timestamp = new Date().toISOString().replaceAll(':', '-').replace('.', '-')
  const extension = extname(databasePath) || '.sqlite'
  const name = basename(databasePath, extname(databasePath))
  const backupPath = join(backupDirectory, `${name}-${kind}-${timestamp}${extension}`)
  const database = new DatabaseSync(databasePath, { readOnly: true, timeout: 5_000 })

  try {
    await backup(database, backupPath)
    const saved = new DatabaseSync(backupPath)
    try {
      saved.exec('PRAGMA journal_mode = DELETE')
    } finally {
      saved.close()
    }
    validateDatabase(backupPath)
    return backupPath
  } catch (error) {
    await rm(backupPath, { force: true })
    throw error
  } finally {
    database.close()
  }
}
