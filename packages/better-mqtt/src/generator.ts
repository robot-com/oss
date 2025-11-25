export interface AsyncGeneratorWithPush<T> {
    push: (value: T) => void
    throwError: (error: Error) => void
    end: () => void
    generator: AsyncGenerator<T>
}

type QueueItem<T> =
    | { type: 'value'; value: T }
    | { type: 'error'; error: Error }
    | { type: 'done' }

export function createAsyncGenerator<T>(): AsyncGeneratorWithPush<T> {
    let resolve: () => void = () => undefined
    // 'reject' is removed as it's not used
    let promise: Promise<void> = new Promise((res) => {
        resolve = res
        // No 'rej' needed as errors are handled via the queue
    })

    const queue: QueueItem<T>[] = []
    let closed = false

    const push = (value: T): void => {
        if (closed) {
            // console.warn('Attempted to push to a closed generator.')
            return
        }
        queue.push({ type: 'value', value })
        resolve()
        // Create a new promise for the next signal
        promise = new Promise((res) => {
            resolve = res
        })
    }

    const throwError = (error: Error): void => {
        if (closed) {
            // console.warn('Attempted to throw error to a closed generator.')
            return
        }
        queue.push({ type: 'error', error })
        resolve()
        // Create a new promise for the next signal
        promise = new Promise((res) => {
            resolve = res
        })
    }

    const end = (): void => {
        if (closed) {
            // console.warn('Attempted to end a closed generator.')
            return
        }
        closed = true
        queue.push({ type: 'done' })
        resolve()
    }

    async function* generator(): AsyncGenerator<T> {
        while (true) {
            if (queue.length > 0) {
                const item = queue.shift() as QueueItem<T>

                if (item.type === 'value') {
                    yield item.value
                } else if (item.type === 'error') {
                    closed = true
                    throw item.error
                } else if (item.type === 'done') {
                    break
                }
            } else {
                await promise // Wait for a new value or a signal
            }
        }

        closed = true
    }

    return { push, throwError, end, generator: generator() }
}
