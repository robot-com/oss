import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * The parsed contents of the root `package.json` file.
 * @type {Record<string, any>}
 */
const pkg = JSON.parse(await readFile('./package.json', 'utf-8'))

const localVersion = pkg.version
const remotePkg = await fetch(`https://registry.npmjs.org/${pkg.name}/latest`).then(res => res.json())
const remoteVersion = remotePkg.version

if (localVersion === remoteVersion) {
    console.info('Version already exists, skipping publish')
    process.exit(0)
} else {
    console.info('Version mismatch, publishing')
    const moreArgs = process.argv.slice(2)
    const p = spawn('npm', ['publish', '--access=public', ...moreArgs], { stdio: 'inherit', cwd: path.resolve('./dist') })

    const { promise, resolve, reject } = Promise.withResolvers()

    p.on('close', (code) => {
        if (code === 0) {
            resolve(true)
        } else {
            reject(new Error(`npm publish failed with code ${code}`))
        }
    })

    await promise
}