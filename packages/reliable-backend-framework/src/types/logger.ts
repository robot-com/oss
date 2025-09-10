import type { JsMsg } from '@nats-io/jetstream'
import type { RBFError } from '../server/error'
import type { MatchResult } from '../server/registry'

export type Logger = {
    onMessage?: (params: {
        requestId: string | null
        queueSubject: string
        msg: JsMsg
        match: MatchResult | null
    }) => unknown
    onReplyExistingResponse?: (params: {
        requestId: string
        queueSubject: string
        msg: JsMsg
        match: MatchResult
        data: unknown
        statusCode: number
    }) => unknown
    onReplyNewResponse?: (params: {
        requestId: string
        queueSubject: string
        msg: JsMsg
        match: MatchResult
        data: unknown
        statusCode: number
        error: RBFError | null
    }) => unknown

    // Errors
    onMessageBadRequest?: (params: {
        requestId: string
        queueSubject: string
        msg: JsMsg
        match: MatchResult
        error: Error
    }) => unknown
    onSaveResultFailed?: (params: {
        requestId: string
        queueSubject: string
        msg: JsMsg
        match: MatchResult
        data: unknown
    }) => unknown
    onRequestIdConflict?: (params: {
        requestId: string
        queueSubject: string
        msg: JsMsg
        match: MatchResult
    }) => unknown
    onHandleMessageError?: (params: {
        requestId: string | null
        queueSubject: string
        error: RBFError
    }) => unknown
    onStartQueueError?: (params: {
        streamName: string
        consumerName: string
        subject: string
        error: Error
    }) => unknown
}

function createConsoleLogger(): Logger {
    return {
        onMessage: ({ requestId, queueSubject, msg, match }) => {
            console.log('onMessage', {
                requestId,
                queueSubject,
                subject: msg.subject,
                match,
            })
        },
        onReplyExistingResponse: ({
            requestId,
            queueSubject,
            msg,
            match,
            data,
        }) => {
            console.log('onReplyExistingResponse', {
                requestId,
                queueSubject,
                subject: msg.subject,
                match,
                data,
            })
        },
        onMessageBadRequest: ({
            requestId,
            queueSubject,
            msg,
            match,
            error,
        }) => {
            console.error('onMessageBadRequest', {
                requestId,
                queueSubject,
                subject: msg.subject,
                match,
                error,
            })
        },
        onSaveResultFailed: ({ requestId, queueSubject, msg, match, data }) => {
            console.error('onSaveResultFailed', {
                requestId,
                queueSubject,
                subject: msg.subject,
                match,
                data,
            })
        },
        onRequestIdConflict: ({ requestId, queueSubject, msg, match }) => {
            console.error('onRequestIdConflict', {
                requestId,
                queueSubject,
                subject: msg.subject,
                match,
            })
        },
        onHandleMessageError: ({ requestId, queueSubject, error }) => {
            console.error('onHandleMessageError', {
                requestId,
                queueSubject,
                error,
            })
        },
        onStartQueueError: ({ streamName, consumerName, subject, error }) => {
            console.error('onStartQueueError', {
                streamName,
                consumerName,
                subject,
                error,
            })
        },
    }
}

export { createConsoleLogger }
