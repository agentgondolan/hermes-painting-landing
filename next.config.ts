import type { NextConfig } from 'next'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants'

export default function nextConfig(phase: string): NextConfig {
  return {
    reactStrictMode: true,
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next/dev' : '.next/prod',
    output: 'export',
    trailingSlash: false,
  }
}
