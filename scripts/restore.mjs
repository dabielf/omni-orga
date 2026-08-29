#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, rename, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createBackup,
  defaultBackupDirectory,
  validateDatabase,
} from '../src/db/backups.mjs'
import { applyMigrations, defaultDatabasePath } from '../src/db/migrations.mjs'

if (process.argv.length !== 3) {
  console.error('Usage: pnpm restore -- <backup-file>')
  process.exitCode = 1
} else {
  const isTest = process.env.OMNI_ORGA_TEST === '1'
  const databasePath = isTest && process.env.OMNI_ORGA_DATABASE_PATH
    ? process.env.OMNI_ORGA_DATABASE_PATH
    : defaultDatabasePath
  const backupDirectory = isTest && process.env.OMNI_ORGA_BACKUP_DIRECTORY
    ? process.env.OMNI_ORGA_BACKUP_DIRECTORY
    : defaultBackupDirectory(databasePath)
  const lifecyclePath = isTest && process.env.OMNI_ORGA_LIFECYCLE_PATH
    ? process.env.OMNI_ORGA_LIFECYCLE_PATH
    : fileURLToPath(new URL('lifecycle.mjs', import.meta.url))

  function lifecycle(command) {
    return spawnSync(process.execPath, [lifecyclePath, command], {
      encoding: 'utf8',
      env: process.env,
      timeout: 30_000,
    })
  }

  let wasRunning = false
  let stopped = false
  const replacementPath = `${databasePath}.restore-${process.pid}.tmp`
  const displacedPath = `${databasePath}.restore-${process.pid}.old`

  try {
    const status = lifecycle('status')
    if (status.status !== 0) throw new Error(status.stderr.trim() || 'Could not read server state')
    wasRunning = !/^mode: stopped$/m.test(status.stdout)

    if (wasRunning) {
      const stop = lifecycle('stop')
      if (stop.status !== 0) throw new Error(stop.stderr.trim() || 'Could not stop server')
      stopped = true
    }

    const rescuePath = existsSync(databasePath)
      ? await createBackup({ databasePath, backupDirectory, kind: 'rescue' })
      : null
    const selectedPath = resolve(process.argv[2])
    validateDatabase(selectedPath)

    await mkdir(dirname(databasePath), { recursive: true })
    await copyFile(selectedPath, replacementPath)
    await applyMigrations({ databasePath: replacementPath })
    validateDatabase(replacementPath)

    await rm(`${databasePath}-wal`, { force: true })
    await rm(`${databasePath}-shm`, { force: true })
    if (existsSync(databasePath)) await rename(databasePath, displacedPath)
    try {
      await rename(replacementPath, databasePath)
    } catch (error) {
      if (existsSync(displacedPath)) await rename(displacedPath, databasePath)
      throw error
    }
    await rm(displacedPath, { force: true })

    if (wasRunning) {
      const start = lifecycle('start')
      if (start.status !== 0) throw new Error(start.stderr.trim() || 'Could not restart server')
      stopped = false
    }

    console.log(`restored ${selectedPath}`)
    if (rescuePath) console.log(`rescue copy: ${rescuePath}`)
    console.log(`server state: ${wasRunning ? 'running' : 'stopped'}`)
  } catch (error) {
    console.error(`Restore failed: ${error.message}`)
    process.exitCode = 1
  } finally {
    await rm(replacementPath, { force: true })
    if (stopped) {
      const start = lifecycle('start')
      if (start.status !== 0) {
        console.error(start.stderr.trim() || 'Could not restore the running server state')
        process.exitCode = 1
      }
    }
  }
}
