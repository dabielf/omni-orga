#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { appIsHealthy } from './health.mjs'

function pnpm(command, commandEnvironment = process.env) {
  return spawnSync('pnpm', [command], {
    encoding: 'utf8',
    env: commandEnvironment,
    stdio: ['ignore', 'inherit', 'inherit'],
  }).status
}

export function cleanupSmoke(directory, stopStatus) {
  if (stopStatus === 0) {
    rmSync(directory, { recursive: true, force: true })
    return true
  }
  console.error(`Smoke server may still be running. State kept at ${directory}`)
  return false
}

async function smoke() {
  const directory = mkdtempSync(join(tmpdir(), 'omni-orga-smoke-'))
  const env = {
    ...process.env,
    OMNI_ORGA_TEST: '1',
    OMNI_ORGA_DATABASE_PATH: join(directory, 'omni-orga.sqlite'),
    OMNI_ORGA_RUNTIME_DIR: join(directory, 'runtime'),
  }

  let started = false
  try {
    if (pnpm('build') !== 0) process.exitCode = 1
    else if (pnpm('start', env) !== 0) process.exitCode = 1
    else {
      started = true
      if (await appIsHealthy('http://127.0.0.1:4310')) {
        console.log('smoke passed')
      } else {
        console.error('Built server did not serve the expected page')
        process.exitCode = 1
      }
    }
  } finally {
    const stopStatus = started ? pnpm('stop', env) : 0
    if (!cleanupSmoke(directory, stopStatus)) process.exitCode = 1
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await smoke()
