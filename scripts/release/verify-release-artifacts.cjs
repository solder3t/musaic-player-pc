#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '../..')

function parseArgs(argv) {
  const result = {}
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue
    const separatorIndex = arg.indexOf('=')
    if (separatorIndex === -1) {
      result[arg.slice(2)] = 'true'
      continue
    }
    result[arg.slice(2, separatorIndex)] = arg.slice(separatorIndex + 1)
  }
  return result
}

function normalizePlatform(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'linux') return 'linux'
  if (normalized === 'darwin' || normalized === 'mac' || normalized === 'macos') return 'darwin'
  if (normalized === 'win32' || normalized === 'windows' || normalized === 'win') return 'win32'
  return normalized
}

function getRequiredPatterns(platform) {
  if (platform === 'linux') {
    return [
      { name: 'AppImage', pattern: /^Musaic-.*\.AppImage$/i },
      { name: 'Debian Package (.deb)', pattern: /^Musaic-.*\.deb$/i },
      { name: 'RPM Package (.rpm)', pattern: /^Musaic-.*\.rpm$/i },
      { name: 'Tarball (.tar.gz)', pattern: /^Musaic-.*\.tar\.gz$/i },
    ]
  }

  if (platform === 'darwin') {
    return [
      { name: 'macOS Disk Image (.dmg)', pattern: /^Musaic-.*\.dmg$/i },
      { name: 'macOS Zip Archive (.zip)', pattern: /^Musaic-.*\.zip$/i },
    ]
  }

  if (platform === 'win32') {
    return [
      { name: 'Windows Setup (.exe)', pattern: /^Musaic\.Setup\..*\.exe$/i },
      { name: 'Windows Portable (.exe)', pattern: /^Musaic\.Portable\..*\.exe$/i },
    ]
  }

  throw new Error(`Unsupported release artifact platform: ${platform}`)
}

function listDistFiles(distDir) {
  try {
    return fs.readdirSync(distDir).sort()
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const platform = normalizePlatform(args.platform || process.env.MUSAIC_RELEASE_PLATFORM || process.env.MUSAIC_RELEASE_PLATFORM || process.platform)
  const distDir = path.resolve(repoRoot, args['dist-dir'] || process.env.MUSAIC_RELEASE_DIST_DIR || process.env.MUSAIC_RELEASE_DIST_DIR || 'dist')
  
  const requiredPatterns = getRequiredPatterns(platform)
  const actualNames = listDistFiles(distDir)
  const missingTypes = []
  const foundFiles = []

  for (const req of requiredPatterns) {
    const match = actualNames.find((name) => req.pattern.test(name))
    if (!match) {
      missingTypes.push(req.name)
    } else {
      const filePath = path.join(distDir, match)
      const stat = fs.statSync(filePath)
      if (!stat.isFile() || stat.size === 0) {
        missingTypes.push(`${req.name} (file empty or invalid)`)
      } else {
        foundFiles.push(match)
      }
    }
  }

  if (missingTypes.length > 0) {
    console.error(`[verify-release-artifacts] Missing or invalid release artifact(s) for ${platform}:`)
    for (const name of missingTypes) {
      console.error(`  - ${name}`)
    }

    console.error(`[verify-release-artifacts] Files currently in ${distDir}:`)
    if (actualNames.length === 0) {
      console.error('  (none)')
    } else {
      for (const name of actualNames) {
        console.error(`  - ${name}`)
      }
    }
    process.exit(1)
  }

  console.log(`[verify-release-artifacts] ${platform} release artifacts look valid:`)
  for (const name of foundFiles) {
    console.log(`  - ${name}`)
  }

}

main()
