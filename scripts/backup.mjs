#!/usr/bin/env node

import { createBackup, defaultBackupDirectory } from '../src/db/backups.mjs'
import { defaultDatabasePath } from '../src/db/migrations.mjs'

const isTest = process.env.OMNI_ORGA_TEST === '1'
const databasePath = isTest && process.env.OMNI_ORGA_DATABASE_PATH
  ? process.env.OMNI_ORGA_DATABASE_PATH
  : defaultDatabasePath
const backupDirectory = isTest && process.env.OMNI_ORGA_BACKUP_DIRECTORY
  ? process.env.OMNI_ORGA_BACKUP_DIRECTORY
  : defaultBackupDirectory(databasePath)

try {
  console.log(await createBackup({ databasePath, backupDirectory }))
} catch (error) {
  console.error(`Backup failed: ${error.message}`)
  process.exitCode = 1
}
