import { build } from 'tsup'

/**
 * Builds bundles for the project.
 *
 * @returns {Promise<void>} A promise that resolves when the bundles have been built.
 * @typedef {Record<string, any>} PKGJSON
 * @typedef {Record<string, string>} Entry
 * @param {PKGJSON} pkg - The package.json file contents.
 */
export async function buildBundles(pkg) {
    /**
     * @type {Entry}
     */
    const entry = {}

    for (const [key, value] of Object.entries(pkg.exports)) {
        if (key === '.') {
            entry.index = value
        } else {
            const name = key.replace('./', '')
            entry[name] = value
        }
    }

    await build({
        entry,
        platform: 'neutral',
        splitting: false,
        sourcemap: true,
        clean: true,
        dts: true,
        target: ['node20'],
        format: ['cjs', 'esm'],
    })

    // Build bin entry points with shebang
    if (pkg.bin) {
        /** @type {Entry} */
        const binEntry = {}
        for (const [, path] of Object.entries(pkg.bin)) {
            // Extract name from path (e.g., "./bin.js" -> "bin")
            const name = path.replace('./', '').replace('.js', '')
            // Find the source file for this bin entry in exports
            const binExport = pkg.exports[`./${name}`]
            if (binExport) {
                binEntry[name] = binExport
            }
        }

        if (Object.keys(binEntry).length > 0) {
            await build({
                entry: binEntry,
                platform: 'node',
                splitting: false,
                sourcemap: true,
                clean: false,
                dts: false,
                target: ['node20'],
                format: ['esm'],
                banner: {
                    js: '#!/usr/bin/env node',
                },
            })
        }
    }
}
