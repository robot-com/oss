import { readFile } from 'node:fs/promises'
import { buildBundles } from './build.js'
import { copyFiles } from './copyfiles.js'
import { writeDistPackageJson } from './package.js'
import { publishPackage } from './publish.js'

/**
 * The parsed contents of the root `package.json` file.
 * @type {Record<string, any>}
 */
const pkg = JSON.parse(await readFile('./package.json', 'utf-8'))

// Build the package
await buildBundles(pkg)
await writeDistPackageJson(pkg)
await copyFiles()

// Check if we should publish (if --publish flag is passed)
const shouldPublish = process.argv.includes('--publish')
if (shouldPublish) {
    try {
        await publishPackage('./dist')
    } catch (error) {
        console.error('❌ Publishing failed:', error.message)
        process.exit(1)
    }
}
