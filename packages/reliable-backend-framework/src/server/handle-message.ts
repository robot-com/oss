/** biome-ignore-all lint/suspicious/noExplicitAny: It is not a problem */
import type { JetStreamClient, JsMsg } from '@nats-io/jetstream'
import { headers, type NatsConnection } from '@nats-io/nats-core'
import type { AppDefinition, Scheduler } from '../types'
import type { Backend } from './backend'
import type { MatchResult } from './registry'

export function extractSubject(prefix: string, subject: string): string | null {
    let normalized = prefix
    if (prefix.endsWith('.>')) {
        normalized = prefix.slice(0, -2)
    } else if (prefix.endsWith('.')) {
        normalized = prefix.slice(0, -1)
    }
    normalized += '.'

    if (subject.startsWith(normalized)) {
        return subject.slice(normalized.length)
    }

    return null
}

function matchProcedure(
    backend: Backend<AppDefinition<any, any, any, any, any, any>>,
    subjectPrefix: string,
    msg: JsMsg,
): MatchResult | null {
    const subject = extractSubject(subjectPrefix, msg.subject)

    if (!subject) {
        return null
    }

    return backend.app.registry.match(subject)
}

async function replyMessage(
    nc: NatsConnection,
    msg: JsMsg,
    response: {
        requestId: string | null
        statusCode: number
        data: any
    },
): Promise<void> {
    const replyToHeader = msg.headers?.get('Reply-To')

    if (replyToHeader) {
        const h = headers()
        if (response.requestId) {
            h.append('Request-Id', response.requestId)
        }

        h.append('Status-Code', response.statusCode.toString())

        nc.publish(replyToHeader, JSON.stringify(response.data), {
            headers: h,
        })
    }
}

export async function handleMessage(
    backend: Backend<AppDefinition<any, any, any, any, any, any>>,
    message: JsMsg,
    subjectPrefix: string,
): Promise<void> {
    const match = matchProcedure(backend, subjectPrefix, message)

    if (!match) {
        replyMessage(backend.nats, message, {
            data: null,
            statusCode: 404,
            requestId: null,
        })
        message.ack()
        return
    }

    await backend.db.transaction(async (tx) => {
        const input = message.json()

        const ctx = await match.definition._middleware({
            ctx: backend.app._context,
            db: tx,
            scheduler: null as unknown as Scheduler,
            input,
            params: match.params,
            type: match.definition._type,
        })

        const result = await match.definition.handler({
            ctx,
            db: tx,
            input,
            params: match.params,
            scheduler: null as unknown as Scheduler,
        })
    })

    // TODO: Continue building!
}
