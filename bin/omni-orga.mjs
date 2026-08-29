#!/usr/bin/env node
import { run } from '../src/cli/main.mjs'

const { status, output } = run(process.argv.slice(2), process.env)

process.stdout.write(output)
process.exitCode = status
