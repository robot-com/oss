import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * @typedef {Object} PackageJson
 * @property {string} name - The package name
 * @property {string} version - The package version
 * @property {Object} [exports] - Package exports
 * @property {Object} [dependencies] - Package dependencies
 * @property {string} [license] - Package license
 */

/**
 * Gets the current working directory of the script
 * @returns {string} The current working directory
 */
function getCurrentDir() {
    return process.cwd()
}

/**
 * Reads and parses the package.json file from the current directory
 * @returns {Promise<PackageJson>} The parsed package.json contents
 * @throws {Error} If package.json cannot be read or parsed
 */
async function readPackageJson() {
    try {
        const packagePath = join(getCurrentDir(), 'package.json')
        const packageContent = await readFile(packagePath, 'utf-8')
        return JSON.parse(packageContent)
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to read package.json: ${errorMessage}`)
    }
}

/**
 * Checks if a package version already exists on npm
 * @param {string} packageName - The name of the package
 * @param {string} version - The version to check
 * @returns {Promise<boolean>} True if version exists, false otherwise
 */
async function checkVersionExists(packageName, version) {
    return new Promise((resolve, reject) => {
        const viewProcess = spawn(
            'npm',
            ['view', packageName, 'version', '--json'],
            {
                stdio: ['pipe', 'pipe', 'pipe'],
            }
        )

        let stdout = ''
        let _stderr = ''

        viewProcess.stdout.on('data', (data) => {
            stdout += data.toString()
        })

        viewProcess.stderr.on('data', (data) => {
            _stderr += data.toString()
        })

        viewProcess.on('close', (code) => {
            if (code === 0) {
                try {
                    const versions = JSON.parse(stdout)
                    // npm view returns an array of versions
                    const versionExists = Array.isArray(versions)
                        ? versions.includes(version)
                        : versions === version

                    resolve(versionExists)
                } catch (_) {
                    // If parsing fails, assume version doesn't exist
                    resolve(false)
                }
            } else {
                // If npm view fails (e.g., package doesn't exist), version doesn't exist
                resolve(false)
            }
        })

        viewProcess.on('error', (error) => {
            const errorMessage =
                error instanceof Error ? error.message : String(error)
            reject(new Error(`Failed to check version: ${errorMessage}`))
        })
    })
}

/**
 * Publishes the package to npm
 * @param {string} packagePath - The path to the package directory
 * @param {string[]} additionalArgs - Additional arguments to pass to npm publish
 * @returns {Promise<void>} Resolves when publish completes
 */
async function publishPackage(packagePath, additionalArgs = []) {
    return new Promise((resolve, reject) => {
        // Build the npm publish command with additional arguments
        const publishArgs = ['publish', '--access=public', ...additionalArgs]

        const publishProcess = spawn('npm', publishArgs, {
            cwd: packagePath,
            stdio: ['pipe', 'pipe', 'pipe'],
        })

        let stdout = ''
        let stderr = ''

        publishProcess.stdout.on('data', (data) => {
            stdout += data.toString()
        })

        publishProcess.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        publishProcess.on('close', (code) => {
            const output = stdout + stderr

            if (code === 0) {
                console.log('✅ Package published successfully!')
                resolve()
            } else {
                // Handle specific error cases gracefully
                if (
                    output.includes(
                        'You cannot publish over the previously published versions'
                    )
                ) {
                    console.log('⚠️  Version already exists, skipping publish')
                    resolve()
                    return
                }

                if (
                    output.includes('You must be logged in to publish packages')
                ) {
                    console.error(
                        '❌ Not logged in to npm. Please run: npm login'
                    )
                    reject(new Error('Authentication required'))
                    return
                }

                if (
                    output.includes('npm ERR! 403') ||
                    output.includes('npm ERR! 401')
                ) {
                    console.error(
                        '❌ Authentication failed or insufficient permissions'
                    )
                    reject(new Error('Authentication failed'))
                    return
                }

                // For other errors, show the full output
                console.error('❌ Publishing failed:')
                console.error(output.trim())
                reject(new Error(`Publishing failed with exit code ${code}`))
            }
        })

        publishProcess.on('error', (error) => {
            const errorMessage =
                error instanceof Error ? error.message : String(error)
            reject(
                new Error(`Failed to start publish process: ${errorMessage}`)
            )
        })
    })
}

/**
 * Main function that orchestrates the publish process
 * @returns {Promise<void>} Resolves when the entire process completes
 */
async function main() {
    try {
        console.log('📦 Starting package publish process...')

        // Capture additional arguments passed to the script
        const additionalArgs = process.argv.slice(2)
        if (additionalArgs.length > 0) {
            console.log(`📝 Additional arguments: ${additionalArgs.join(' ')}`)
        }

        // Read package.json
        const packageJson = await readPackageJson()
        const { name, version } = packageJson

        if (!name || !version) {
            throw new Error('Package name or version not found in package.json')
        }

        console.log(`📋 Package: ${name}`)
        console.log(`🏷️  Version: ${version}`)

        // Check if version already exists
        console.log('🔍 Checking if version already exists on npm...')
        const versionExists = await checkVersionExists(name, version)

        if (versionExists) {
            console.log(`⚠️  Version ${version} already exists on npm`)
            console.log('🚫 Skipping publish - no action needed')
            return
        }

        console.log(`✨ Version ${version} is new, proceeding with publish...`)

        // Publish the package from the current directory (should be dist/)
        await publishPackage(getCurrentDir(), additionalArgs)

        console.log('🎉 Publish process completed successfully!')
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error)
        console.error('💥 Publish process failed:', errorMessage)
        process.exit(1)
    }
}

// Run the main function if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main()
}

export { checkVersionExists, main, publishPackage }

