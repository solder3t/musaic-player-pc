#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

try {
  require('./sync-version.cjs').syncVersion(true)
} catch {
  // Ignore sync errors during metadata generation
}

const outputPath = path.resolve(__dirname, '../../out/build-metadata.json')
const repoRoot = path.resolve(__dirname, '../..')

const DIRTY_ENV_TRUE_VALUES = new Set(['1', 'true', 'yes', 'dirty'])
const DIRTY_ENV_FALSE_VALUES = new Set(['0', 'false', 'no', 'clean'])

function normalizeCommitHash(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseDirtyEnvValue(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null
  if (DIRTY_ENV_TRUE_VALUES.has(normalized)) return true
  if (DIRTY_ENV_FALSE_VALUES.has(normalized)) return false
  return null
}

function execGit(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
}

function loadEnvFile(filePath) {
  const env = {}
  if (!fs.existsSync(filePath)) return env
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim()
        let val = trimmed.slice(eqIdx + 1).trim()
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1)
        }
        env[key] = val
      }
    }
  } catch {
    // Ignore error
  }
  return env
}

function resolveBuildMetadata() {
  const envCommitHash = normalizeCommitHash(process.env.MUSAIC_GIT_COMMIT)
  const envDirty = parseDirtyEnvValue(process.env.MUSAIC_GIT_DIRTY)

  const localEnv = loadEnvFile(path.resolve(repoRoot, '.env.local'))
  const rootEnv = loadEnvFile(path.resolve(repoRoot, '.env'))

  const lastFmApiKey = (process.env.LASTFM_API_KEY || localEnv.LASTFM_API_KEY || rootEnv.LASTFM_API_KEY || '').trim() || null
  const lastFmSharedSecret = (process.env.LASTFM_SHARED_SECRET || localEnv.LASTFM_SHARED_SECRET || rootEnv.LASTFM_SHARED_SECRET || '').trim() || null

  let commitHash = envCommitHash
  let isDirty = envDirty ?? false

  if (!commitHash) {
    try {
      commitHash = normalizeCommitHash(execGit(['rev-parse', 'HEAD']))
      isDirty = envDirty ?? execGit(['status', '--porcelain']).trim().length > 0
    } catch {
      commitHash = null
      isDirty = false
    }
  }

  return {
    commitHash,
    isDirty,
    lastFmApiKey,
    lastFmSharedSecret
  }
}

const metadata = resolveBuildMetadata()
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
