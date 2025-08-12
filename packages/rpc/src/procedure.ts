import { type ZodNull, type ZodType, z } from 'zod'
import type { HttpMethod, Procedure } from './types'

type ProcedureOptions<
    P extends ZodType | undefined = undefined,
    I extends ZodType | undefined = undefined,
    O extends ZodType = ZodType,
> = {
    method: HttpMethod
    path: string
    paramsSchema?: P
    inputSchema?: I
    outputSchema: O
}

export function defineProcedure<
    P extends ZodType | undefined = undefined,
    I extends ZodType | undefined = undefined,
    O extends ZodType = ZodType,
>(
    options: ProcedureOptions<P, I, O>
): Procedure<
    P extends ZodType ? P : ZodNull,
    I extends ZodType ? I : ZodNull,
    O
> {
    return {
        method: options.method,
        path: options.path,
        // biome-ignore lint/suspicious/noExplicitAny: It is safe to cast here
        paramsSchema: (options.paramsSchema ?? z.null().catch(null)) as any,
        // biome-ignore lint/suspicious/noExplicitAny: It is safe to cast here
        inputSchema: (options.inputSchema ?? z.null().catch(null)) as any,
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
    params: Record<string, string> = {}
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
