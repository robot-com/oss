// A utility type to split a string literal by a delimiter.
type Split<
    S extends string,
    D extends string,
> = S extends `${infer T}${D}${infer U}` ? [T, ...Split<U, D>] : [S]

// A utility type to extract the parameter names (e.g., 'id' from '$id').
type ExtractParamKeys<T extends string> = {
    // 1. Split the path string by '.'
    [Part in Split<T, '.'>[number]]: Part extends `$${infer ParamName}` // 2. For each part, check if it starts with '$'
        ? ParamName // 3. If it does, infer and return the name
        : never // 4. Otherwise, discard it
}[Split<T, '.'>[number]] // 5. Get the union of all valid parameter names

/**
 * Generates an object type from a path string.
 * For each segment of the path starting with '$', it creates a key
 * in the object with a 'string' type.
 * @example
 * // Result: { id: string }
 * type JobParams = PathToParams<'api.jobs.get.$id'>;
 *
 * // Result: { orgId: string; userId: string }
 * type UserParams = PathToParams<'api.orgs.$orgId.users.get.$userId'>;
 */
export type PathToParams<T extends string> = {
    [K in ExtractParamKeys<T>]: string
}

export function buildPath(
    path: string,
    params: Record<string, string>,
): string {
    const getParam = (key: string) => {
        const value = params[key]
        if (!value) {
            throw new Error(`Missing parameter: ${key}`)
        }

        return encodeURIComponent(value)
    }

    return path.replace(/\$([a-zA-Z0-9_]+)/g, (_, key) => getParam(key))
}
