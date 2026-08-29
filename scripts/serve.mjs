#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { applyMigrations } from '../src/db/migrations.mjs'

const mode = process.env.OMNI_ORGA_MODE
const token = process.env.OMNI_ORGA_INSTANCE_TOKEN
const databasePath = process.env.OMNI_ORGA_DATABASE_PATH
const host = process.env.HOST ?? '127.0.0.1'
const port = Number(process.env.PORT ?? 4310)

if (!['normal', 'development'].includes(mode) || !token || !databasePath) {
  throw new Error('The lifecycle command must start the server')
}

const applied = await applyMigrations({ databasePath })
console.log(`${mode} server starting at http://${host}:${port}`)
if (applied.length) console.log(`applied migrations: ${applied.join(', ')}`)

if (mode === 'normal') {
  await import('../.output/server/index.mjs')
} else {
  const checkout = fileURLToPath(new URL('..', import.meta.url))
  const vite = join(checkout, 'node_modules', 'vite', 'bin', 'vite.js')
  const viteEnvironment = { ...process.env }
  delete viteEnvironment.HOST
  delete viteEnvironment.PORT
  const child = spawn(
    process.execPath,
    [vite, 'dev', '--host', host, '--port', String(port), '--strictPort'],
    { cwd: checkout, env: viteEnvironment, stdio: 'inherit' },
  )

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => child.kill(signal))
  }

  const code = await new Promise((resolve) => child.once('exit', resolve))
  if (code) process.exitCode = code
}
