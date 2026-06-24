#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const repoRoot = new URL('..', import.meta.url)
const rel = (path) => new URL(path, repoRoot)

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
    ...options,
  })

  return {
    command: [command, ...args].join(' '),
    status: result.status ?? 1,
    stdout: result.stdout?.trim() || '',
    stderr: result.stderr?.trim() || '',
  }
}

function printBlock(title, body) {
  console.log(`\n## ${title}`)
  console.log(body || '(none)')
}

const status = run('git', ['status', '--short'])
const branch = run('git', ['branch', '--show-current'])
const commits = run('git', ['log', '--oneline', '-5'])

console.log(`# Agent status — ${new Date().toISOString()}`)
printBlock('Branch', branch.stdout || '(unknown)')
printBlock('Working tree', status.stdout || 'clean')
printBlock('Recent commits', commits.stdout)

const activeWorkPath = rel('docs/ACTIVE_WORK.md')
if (existsSync(activeWorkPath)) {
  const activeWork = readFileSync(activeWorkPath, 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('## ') || line.startsWith('1.') || line.startsWith('2.') || line.startsWith('3.') || line.startsWith('4.') || line.startsWith('5.') || line.startsWith('- `'))
    .slice(0, 60)
    .join('\n')
  printBlock('Active work summary', activeWork)
} else {
  printBlock('Active work summary', 'docs/ACTIVE_WORK.md missing')
}

if (status.status !== 0 || branch.status !== 0 || commits.status !== 0) {
  process.exitCode = 1
}
