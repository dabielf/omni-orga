import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { cleanupSmoke } from '../scripts/smoke.mjs'

test('failed smoke stop keeps ownership state for recovery', () => {
  const directory = mkdtempSync(join(tmpdir(), 'omni-orga-smoke-cleanup-'))
  try {
    assert.equal(cleanupSmoke(directory, 1), false)
    assert.equal(existsSync(directory), true)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
