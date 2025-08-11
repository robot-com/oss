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
}
