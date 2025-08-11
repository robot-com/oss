import { copyFile } from 'node:fs/promises'

export async function copyFiles() {
    await copyFile('../../LICENSE', './dist/LICENSE')
    await copyFile('./README.md', './dist/README.md')
    await copyFile('./CHANGELOG.md', './dist/CHANGELOG.md').catch(
        () => undefined
    )
}
