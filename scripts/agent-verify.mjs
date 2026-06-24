#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const repoRoot = new URL('..', import.meta.url)

const commands = [
  ['node', ['--test', 'tests/account-panel-source.test.ts', 'tests/magic-link-return-source.test.ts', 'tests/purchase-panel-source.test.ts']],
  ['node', ['--test', 'tests/*.test.ts'], { shell: true }],
  ['npm', ['run', 'worker:typecheck']],
  ['npm', ['run', 'build']],
]

function run(command, args, options = {}) {
  const label = [command, ...args].join(' ')
  console.log(`\n## ${label}`)
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })

  const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
  if (output) console.log(output)
  if (result.status !== 0) {
    console.error(`\nFAILED: ${label}`)
    process.exit(result.status ?? 1)
  }
}

for (const [command, args, options] of commands) {
  run(command, args, options)
}

console.log('\nAll agent verification checks passed.')
