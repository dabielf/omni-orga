#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { appIsHealthy } from './health.mjs'

const checkout = realpathSync(fileURLToPath(new URL('..', import.meta.url)))
const servePath = join(checkout, 'scripts', 'serve.mjs')
const isTest = process.env.OMNI_ORGA_TEST === '1'
const host = '127.0.0.1'
const port = isTest && process.env.OMNI_ORGA_PORT
  ? Number(process.env.OMNI_ORGA_PORT)
  : 4310
const url = `http://${host}:${port}`
const runtimeDirectory = isTest && process.env.OMNI_ORGA_RUNTIME_DIR
  ? process.env.OMNI_ORGA_RUNTIME_DIR
  : join(checkout, '.omni-orga')
const databasePath = isTest && process.env.OMNI_ORGA_DATABASE_PATH
  ? process.env.OMNI_ORGA_DATABASE_PATH
  : join(checkout, 'data', 'omni-orga.sqlite')
const statePath = join(runtimeDirectory, 'server.json')
const logPath = join(runtimeDirectory, 'server.log')
const startLockPath = join(runtimeDirectory, 'starting')

function readState() {
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'))
  } catch {
    return null
  }
}

function writeState(state) {
  mkdirSync(runtimeDirectory, { recursive: true })
  const temporaryPath = `${statePath}.${process.pid}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`)
  renameSync(temporaryPath, statePath)
}

function removeState(token) {
  const state = readState()
  if (!token || state?.token === token) rmSync(statePath, { force: true })
}

function acquireStartLock() {
  mkdirSync(runtimeDirectory, { recursive: true })
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      mkdirSync(startLockPath)
      return true
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      const stale = Date.now() - statSync(startLockPath).mtimeMs > 30_000
      if (attempt === 0 && stale) {
        rmSync(startLockPath, { recursive: true, force: true })
        continue
      }
      console.error('another start or dev command is in progress')
      process.exitCode = 1
      return false
    }
  }
}

function releaseStartLock() {
  rmSync(startLockPath, { recursive: true, force: true })
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function processCommand(pid) {
  return spawnSync('ps', ['-p', String(pid), '-o', 'command='], {
    encoding: 'utf8',
  }).stdout.trim()
}

function stateOwnsProcess(state) {
  if (
    state?.checkout !== checkout ||
    !Number.isInteger(state.pid) ||
    typeof state.token !== 'string'
  ) {
    return false
  }

  const command = processCommand(state.pid)
  return command.includes(servePath) && command.includes(state.token)
}

async function waitForHealth(pid) {
  const startupTimeoutMs = 20_000
  const deadline = Date.now() + startupTimeoutMs
  while (Date.now() < deadline && processIsAlive(pid)) {
    if (await appIsHealthy(url)) return true
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return false
}

function listener() {
  const result = spawnSync(
    'lsof',
    ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc'],
    { encoding: 'utf8' },
  )
  const pid = Number(result.stdout.match(/^p(\d+)$/m)?.[1])
  if (!Number.isInteger(pid)) return null
  return { pid, command: processCommand(pid) || 'unknown command' }
}

function reportListener(activeListener) {
  console.error(`Port ${port} is already in use.`)
  console.error(`listener PID: ${activeListener.pid}`)
  console.error(`listener command: ${activeListener.command}`)
}

async function serverCanStart(mode) {
  const state = readState()
  if (state && processIsAlive(state.pid) && stateOwnsProcess(state)) {
    if (await appIsHealthy(url)) {
      if (mode === 'normal') {
        console.log(`already running at ${url}`)
        return false
      }
      console.error(`${state.mode} server already running; stop it first`)
      process.exitCode = 1
      return false
    }
    console.error(`registered ${state.mode} server PID ${state.pid} is unhealthy; stop it first`)
    process.exitCode = 1
    return false
  } else if (state) {
    removeState(state.token)
  }

  const activeListener = listener()
  if (activeListener) {
    reportListener(activeListener)
    process.exitCode = 1
    return false
  }
  return true
}

function childEnvironment(mode, token) {
  return {
    ...process.env,
    HOST: host,
    PORT: String(port),
    OMNI_ORGA_DATABASE_PATH: databasePath,
    OMNI_ORGA_MODE: mode,
    OMNI_ORGA_INSTANCE_TOKEN: token,
  }
}

async function start() {
  if (!acquireStartLock()) return
  if (!(await serverCanStart('normal'))) {
    releaseStartLock()
    return
  }

  mkdirSync(runtimeDirectory, { recursive: true })
  const log = openSync(logPath, 'a')
  const token = randomUUID()
  const child = spawn(
    process.execPath,
    [servePath, '--mode', 'normal', '--instance-token', token],
    {
      cwd: checkout,
      detached: true,
      env: childEnvironment('normal', token),
      stdio: ['ignore', log, log],
    },
  )
  child.unref()
  closeSync(log)

  writeState({ checkout, pid: child.pid, mode: 'normal', token, url })
  if (await waitForHealth(child.pid)) {
    releaseStartLock()
    console.log(`healthy server at ${url}`)
    return
  }

  if (processIsAlive(child.pid) && stateOwnsProcess(readState())) {
    process.kill(child.pid, 'SIGTERM')
  }
  removeState(token)
  releaseStartLock()
  console.error('Server did not become healthy. Run pnpm logs.')
  process.exitCode = 1
}

async function dev() {
  if (!acquireStartLock()) return
  if (!(await serverCanStart('development'))) {
    releaseStartLock()
    return
  }

  mkdirSync(runtimeDirectory, { recursive: true })
  const log = openSync(logPath, 'a')
  const token = randomUUID()
  const child = spawn(
    process.execPath,
    [servePath, '--mode', 'development', '--instance-token', token],
    {
      cwd: checkout,
      env: childEnvironment('development', token),
      stdio: ['inherit', 'pipe', 'pipe'],
    },
  )
  writeState({ checkout, pid: child.pid, mode: 'development', token, url })

  for (const [stream, destination] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]) {
    stream.on('data', (chunk) => {
      destination.write(chunk)
      writeFileSync(log, chunk)
    })
  }

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => child.kill(signal))
  }

  const exitPromise = new Promise((resolve) =>
    child.once('exit', (code, signal) => resolve({ code, signal })),
  )
  const healthy = await waitForHealth(child.pid)
  releaseStartLock()
  if (!healthy) child.kill('SIGTERM')

  const exit = await exitPromise
  closeSync(log)
  removeState(token)
  if (!healthy) {
    console.error('Development server did not become healthy.')
    process.exitCode = 1
    return
  }
  if (exit.code && exit.code !== 0) process.exitCode = exit.code
}

async function status() {
  const state = readState()
  const owned = state && processIsAlive(state.pid) && stateOwnsProcess(state)
  if (!owned) {
    if (state) removeState(state.token)
    console.log(`checkout: ${checkout}`)
    console.log('PID: none')
    console.log('mode: stopped')
    console.log(`URL: ${url}`)
    console.log('health: stopped')
    return
  }

  console.log(`checkout: ${checkout}`)
  console.log(`PID: ${state.pid}`)
  console.log(`mode: ${state.mode}`)
  console.log(`URL: ${url}`)
  console.log(`health: ${(await appIsHealthy(url)) ? 'healthy' : 'unhealthy'}`)
}

async function stop() {
  const state = readState()
  if (!state) {
    console.log('not running')
    return
  }
  if (!processIsAlive(state.pid)) {
    removeState(state.token)
    console.log('not running')
    return
  }
  if (!stateOwnsProcess(state)) {
    console.error(`refusing to stop PID ${state.pid}: it does not belong to this checkout`)
    process.exitCode = 1
    return
  }

  process.kill(state.pid, 'SIGTERM')
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline && processIsAlive(state.pid)) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  if (processIsAlive(state.pid) && stateOwnsProcess(state)) {
    process.kill(state.pid, 'SIGKILL')
  }
  removeState(state.token)
  console.log(`stopped PID ${state.pid}`)
}

function logs() {
  if (!existsSync(logPath)) {
    console.log('no server logs yet')
    return
  }
  const lines = readFileSync(logPath, 'utf8').trimEnd().split('\n')
  console.log(lines.slice(-200).join('\n'))
}

const commands = { dev, logs, start, status, stop }
const command = process.argv[2]

if (!commands[command]) {
  console.error('Usage: lifecycle.mjs <dev|logs|start|status|stop>')
  process.exitCode = 1
} else {
  await commands[command]()
}
