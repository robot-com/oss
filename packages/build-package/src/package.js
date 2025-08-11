import { writeFile } from 'node:fs/promises'

/**
 * Generates and writes a `package.json` file into the `dist` directory
 * for publishing purposes.
 *
 * This function:
 * - Reads the root `package.json`
 * - Extracts the original `exports` field to determine export entry points
 * - Builds a proper `exports` map for both ESM and CommonJS
 * - Copies relevant metadata (name, version, license, dependencies, etc.)
 * - Writes the resulting JSON to `./dist/package.json`
 *
 * @async
 * @param {Record<string, any>} pkg - The original package.json contents.
 * @function writeDistPackageJson
 * @returns {Promise<void>} Resolves when the file has been successfully written.
 *
 * @example
 * // Run this after building your project to prepare the dist package.json
 * await writeDistPackageJson()
 */
export async function writeDistPackageJson(pkg) {
    const exportsNames = Object.keys(pkg.exports)

    /** @type {Record<string, any>} */
    const pkgExports = {}

    for (const value of exportsNames) {
        const name = value === '.' ? 'index' : value.replace('./', '')

        pkgExports[name === 'index' ? '.' : `./${name}`] = {
            types: {
                import: `./${name}.d.ts`,
                require: `./${name}.d.ts`
            },
            require: `./${name}.js`,
            import: `./${name}.js`
        }
    }

    const publishablePkgJson = {
        name: pkg['publish-name'] ?? pkg.name,
        bin: pkg['publish-bin'] ?? pkg.bin,
        version: pkg.version,
        description: pkg.description,
        license: pkg.license,
        author: pkg.author,
        module: pkg.module,
        type: pkg.type,
        exports: pkgExports,
        dependencies: pkg.dependencies,
        peerDependencies: pkg.peerDependencies
    }

    await writeFile(
        './dist/package.json',
        JSON.stringify(publishablePkgJson, null, 2)
    )
}