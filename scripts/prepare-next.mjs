#!/usr/bin/env node

import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const mode = process.argv[2] ?? 'dev'
const projectRoot = process.cwd()
const distDir = mode === 'dev' ? '.next/dev' : '.next/prod'

rmSync(resolve(projectRoot, distDir), { recursive: true, force: true })
