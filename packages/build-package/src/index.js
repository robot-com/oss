import { readFile } from 'node:fs/promises'
import { buildBundles } from './build.js'
import { copyFiles } from './copyfiles.js'
import { writeDistPackageJson } from './package.js'

/**
 * The parsed contents of the root `package.json` file.
 * @type {Record<string, any>}
 */
const pkg = JSON.parse(await readFile('./package.json', 'utf-8'))

await buildBundles(pkg)
await writeDistPackageJson(pkg)
await copyFiles()
