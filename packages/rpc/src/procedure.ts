import type { ZodType } from 'zod'
import type { HttpMethod, Procedure } from './types'

type ProcedureOptions<
    P extends ZodType,
    I extends ZodType,
    O extends ZodType,
> = {
    method: HttpMethod
    path: string
    paramsSchema: P
    inputSchema: I
    outputSchema: O
}

export function defineProcedure<
    P extends ZodType,
    I extends ZodType,
    O extends ZodType,
>(options: ProcedureOptions<P, I, O>): Procedure<P, I, O> {
    return {
        method: options.method,
        path: options.path,
        paramsSchema: options.paramsSchema,
        inputSchema: options.inputSchema,
        outputSchema: options.outputSchema,
    }
}

const mapHTTPMethod = {
    PUT: 'do',
    GET: 'get',
    POST: 'create',
    PATCH: 'update',
    DELETE: 'delete',
}

export function createPathFromParams(
    procedure: Procedure,
    params: Record<string, string>
): string {
    const segments = procedure.path.split('.')
    const path = segments.map((segment) => {
        if (segment.startsWith('$')) {
            const paramName = segment.slice(1)
            if (paramName === 'method') {
                return mapHTTPMethod[procedure.method]!
            }

            if (params[paramName] !== undefined) {
                return params[paramName]
            }
            throw new Error(`Missing parameter: ${paramName}`)
        }
        return segment
    })
    return path.join('.')
}
