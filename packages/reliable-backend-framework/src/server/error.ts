/** biome-ignore-all lint/suspicious/noExplicitAny: It is needed */
import { ZodError } from 'zod'

export type RBFErrorCode =
    | 'BAD_REQUEST'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'INTERNAL_SERVER_ERROR'
    | 'ABORTED'
    | 'REQUEST_ID_CONFLICT'
    | 'CONCURRENCY_CONFLICT'

const RBF_ERROR_CODE_TO_HTTP_STATUS: Record<RBFErrorCode, number> = {
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    REQUEST_ID_CONFLICT: 409,
    CONCURRENCY_CONFLICT: 500,
    INTERNAL_SERVER_ERROR: 500,
    ABORTED: 499,
}

export class RBFError extends Error {
    public readonly code: RBFErrorCode

    constructor(code: RBFErrorCode, message: string, cause?: unknown) {
        super(message, { cause })
        this.name = 'RBFError'
        this.code = code

        // This is to make `instanceof RBFError` work correctly in TypeScript
        Object.setPrototypeOf(this, RBFError.prototype)
    }

    /**
     * Gets the corresponding HTTP status code for the error.
     */
    get statusCode(): number {
        return RBF_ERROR_CODE_TO_HTTP_STATUS[this.code]
    }

    get data(): any {
        return {
            code: this.code,
            message: this.message,
        }
    }

    /**
     * Creates an RBFError from an unknown error type.
     * Handles ZodErrors, Drizzle ORM/Postgres errors, and other generic errors.
     * @param error The error to convert.
     * @returns An instance of RBFError.
     */
    public static from(error: unknown): RBFError {
        if (error instanceof RBFError) {
            return error
        }

        if (error instanceof ZodError) {
            const message = Object.entries(error.flatten().fieldErrors)
                .map(
                    ([field, messages]) =>
                        `${field}: ${messages?.join(', ') ?? '(no messages)'}`,
                )
                .join('; ')
            return new RBFError(
                'BAD_REQUEST',
                message || 'Invalid input data.',
                error,
            )
        }

        // Handle Drizzle ORM / node-postgres errors
        if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            typeof (error as any).code === 'string'
        ) {
            switch ((error as any).code) {
                case '23505': // unique_violation
                    return new RBFError(
                        'CONFLICT',
                        'A resource with the provided unique identifier already exists.',
                        error,
                    )
                case '23503': // foreign_key_violation
                    return new RBFError(
                        'BAD_REQUEST',
                        'The operation failed because a related resource does not exist.',
                        error,
                    )
                case '22P02': // invalid_text_representation
                    return new RBFError(
                        'BAD_REQUEST',
                        'An invalid value was provided for a parameter.',
                        error,
                    )
            }
        }

        if (error instanceof Error) {
            return new RBFError('INTERNAL_SERVER_ERROR', error.message, error)
        }

        return new RBFError(
            'INTERNAL_SERVER_ERROR',
            'An unknown error occurred.',
            error,
        )
    }
}
