#!/usr/bin/env node

/**
 * Musaic Version Synchronizer
 * 
 * Automatically synchronizes the application version from package.json to:
 * - package-lock.json
 * - .github/aur/PKGBUILD
 * - .github/homebrew/musaic-player.rb
 */

const fs = require('fs')
const path = require('path')

function syncVersion(silent = false) {
  const repoRoot = path.resolve(__dirname, '../..')
  const pkgJsonPath = path.join(repoRoot, 'package.json')

  if (!fs.existsSync(pkgJsonPath)) {
    if (!silent) console.error('[sync-version] Error: package.json not found at', pkgJsonPath)
    return 0
  }

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
  const targetVersion = pkgJson.version

  if (!targetVersion || typeof targetVersion !== 'string') {
    if (!silent) console.error('[sync-version] Error: Invalid or missing version in package.json')
    return 0
  }

  if (!silent) console.log(`[sync-version] Synchronizing Musaic version: ${targetVersion}`)
  let updatedCount = 0

  // 1. Synchronize package-lock.json
  const lockfilePath = path.join(repoRoot, 'package-lock.json')
  if (fs.existsSync(lockfilePath)) {
    try {
      const lockfileContent = fs.readFileSync(lockfilePath, 'utf8')
      const lockfile = JSON.parse(lockfileContent)
      let lockModified = false

      if (lockfile.version !== targetVersion) {
        lockfile.version = targetVersion
        lockModified = true
      }
      if (lockfile.packages && lockfile.packages[''] && lockfile.packages[''].version !== targetVersion) {
        lockfile.packages[''].version = targetVersion
        lockModified = true
      }

      if (lockModified) {
        fs.writeFileSync(lockfilePath, JSON.stringify(lockfile, null, 2) + '\n', 'utf8')
        if (!silent) console.log(`  ✔ Updated package-lock.json -> ${targetVersion}`)
        updatedCount++
      } else if (!silent) {
        console.log(`  • package-lock.json already up to date (${targetVersion})`)
      }
    } catch (err) {
      if (!silent) console.error('[sync-version] Warning: Failed to update package-lock.json:', err.message)
    }
  }

  // 2. Synchronize Arch Linux AUR PKGBUILD
  const pkgbuildPath = path.join(repoRoot, '.github/aur/PKGBUILD')
  if (fs.existsSync(pkgbuildPath)) {
    try {
      const content = fs.readFileSync(pkgbuildPath, 'utf8')
      const updatedContent = content.replace(/^pkgver=.*$/m, `pkgver=${targetVersion}`)
      if (content !== updatedContent) {
        fs.writeFileSync(pkgbuildPath, updatedContent, 'utf8')
        if (!silent) console.log(`  ✔ Updated .github/aur/PKGBUILD -> pkgver=${targetVersion}`)
        updatedCount++
      } else if (!silent) {
        console.log(`  • .github/aur/PKGBUILD already up to date (pkgver=${targetVersion})`)
      }
    } catch (err) {
      if (!silent) console.error('[sync-version] Warning: Failed to update PKGBUILD:', err.message)
    }
  }

  // 3. Synchronize macOS Homebrew formula
  const homebrewPath = path.join(repoRoot, '.github/homebrew/musaic-player.rb')
  if (fs.existsSync(homebrewPath)) {
    try {
      const content = fs.readFileSync(homebrewPath, 'utf8')
      const updatedContent = content.replace(/^\s*version\s+".*"$/m, `  version "${targetVersion}"`)
      if (content !== updatedContent) {
        fs.writeFileSync(homebrewPath, updatedContent, 'utf8')
        if (!silent) console.log(`  ✔ Updated .github/homebrew/musaic-player.rb -> version "${targetVersion}"`)
        updatedCount++
      } else if (!silent) {
        console.log(`  • .github/homebrew/musaic-player.rb already up to date (version "${targetVersion}")`)
      }
    } catch (err) {
      if (!silent) console.error('[sync-version] Warning: Failed to update Homebrew formula:', err.message)
    }
  }

  if (!silent) console.log(`[sync-version] Done. ${updatedCount} file(s) updated.`)
  return updatedCount
}

module.exports = { syncVersion }

if (require.main === module) {
  syncVersion(false)
}
