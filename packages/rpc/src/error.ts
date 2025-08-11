export type RpcErrorCode =
    | 'PARSE_ERROR'
    | 'BAD_REQUEST'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'METHOD_NOT_SUPPORTED'
    | 'TIMEOUT'
    | 'CONFLICT'
    | 'PRECONDITION_FAILED'
    | 'PAYLOAD_TOO_LARGE'
    | 'UNPROCESSABLE_CONTENT' // Corresponds to UNPROCESSABLE_ENTITY in tRPC
    | 'TOO_MANY_REQUESTS'
    | 'CLIENT_CLOSED_REQUEST' // Non-standard
    | 'INTERNAL_SERVER_ERROR'
    | 'NOT_IMPLEMENTED'
    | 'BAD_GATEWAY'
    | 'SERVICE_UNAVAILABLE'
    | 'GATEWAY_TIMEOUT'

export class RPCError extends Error {
    __isRPCError = true
    code: RpcErrorCode

    constructor(code: RpcErrorCode, message: string) {
        super(message)
        this.name = 'RPCError'
        this.code = code
    }

    get statusCode(): number {
        switch (this.code) {
            case 'PARSE_ERROR':
                return 400 // Bad Request
            case 'BAD_REQUEST':
                return 400 // Bad Request
            case 'UNAUTHORIZED':
                return 401 // Unauthorized
            case 'FORBIDDEN':
                return 403 // Forbidden
            case 'NOT_FOUND':
                return 404 // Not Found
            case 'METHOD_NOT_SUPPORTED':
                return 405 // Method Not Allowed
            case 'TIMEOUT':
                return 408 // Request Timeout
            case 'CONFLICT':
                return 409 // Conflict
            case 'PRECONDITION_FAILED':
                return 412 // Precondition Failed
            case 'PAYLOAD_TOO_LARGE':
                return 413 // Payload Too Large
            case 'UNPROCESSABLE_CONTENT': // Corresponds to UNPROCESSABLE_ENTITY in tRPC
                return 422 // Unprocessable Content
            case 'TOO_MANY_REQUESTS':
                return 429 // Too Many Requests
            case 'CLIENT_CLOSED_REQUEST':
                return 499 // Client Closed Request (Non-standard)
            case 'INTERNAL_SERVER_ERROR':
                return 500 // Internal Server Error
            case 'NOT_IMPLEMENTED':
                return 501 // Not Implemented
            case 'BAD_GATEWAY':
                return 502 // Bad Gateway
            case 'SERVICE_UNAVAILABLE':
                return 503 // Service Unavailable
            case 'GATEWAY_TIMEOUT':
                return 504 // Gateway Timeout
            default:
                return 500 // Default to Internal Server Error for unknown codes
        }
    }

    toResponse(): Response {
        return Response.json(
            {
                error: this.code,
                message: this.message,
            },
            {
                status: this.statusCode,
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        )
    }

    toReply(): {
        status: number
        body: { error: RpcErrorCode; message: string }
    } {
        return {
            status: this.statusCode,
            body: {
                error: this.code,
                message: this.message,
            },
        }
    }

    /**
     * Checks if the given value is an instance of RPCError.
     * @param error - The value to test.
     * @returns True if the value is an RPCError, false otherwise.
     */
    static isRPCError(error: unknown): error is RPCError {
        return (
            error instanceof RPCError ||
            (typeof error === 'object' &&
                error !== null &&
                '__isRPCError' in error)
        )
    }
}
