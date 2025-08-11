import assert from 'node:assert/strict'
import type { Matcher, Procedure } from '../types'

const MATCH_URL_PARAM_GROUP = '([^/.]+)' // Matches any string until a dot

const mapHTTPMethod = {
    PUT: 'do',
    GET: 'get',
    POST: 'create',
    PATCH: 'update',
    DELETE: 'delete',
}

const validSegmentNameRegex = /^[a-zA-Z0-9_]+$/

export function createRpcMatcher(procedure: Procedure): Matcher {
    const httpExpr: string[] = []
    const rpcExpr: string[] = []

    const paramsNames: string[] = []

    const segments = procedure.path.split('.')

    for (const segment of segments) {
        if (segment.startsWith('$')) {
            if (segment === '$method') {
                rpcExpr.push(mapHTTPMethod[procedure.method])
            } else {
                httpExpr.push(MATCH_URL_PARAM_GROUP)
                rpcExpr.push(MATCH_URL_PARAM_GROUP)
                paramsNames.push(segment.slice(1)) // Remove the leading '$'
            }
        } else {
            assert(
                validSegmentNameRegex.test(segment),
                `Invalid segment name: ${segment}`
            )

            httpExpr.push(segment)
            rpcExpr.push(segment)
        }
    }

    return {
        httpMethod: procedure.method,
        httpPathRegex: new RegExp(`^${httpExpr.join('/')}$`),
        rpcPathRegex: new RegExp(`^${rpcExpr.join('.')}$`),
        paramsNames,
        match(method, path) {
            let groups: string[] | null = null

            if (method === null) {
                const match = this.rpcPathRegex.exec(path)
                if (match) {
                    groups = match.slice(1) // Skip the first element which is the full match
                }
            } else if (this.httpMethod === method) {
                const match = this.httpPathRegex.exec(path)
                if (match) {
                    groups = match.slice(1) // Skip the first element which is the full match
                }
            }

            if (groups) {
                const params: Record<string, string> = {}
                for (let i = 0; i < this.paramsNames.length; i++) {
                    const name = this.paramsNames[i]!
                    const value = groups[i]!
                    params[name] = value
                }
                return {
                    params,
                }
            }

            return null
        },
    }
}
