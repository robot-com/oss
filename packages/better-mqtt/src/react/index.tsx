import type { ErrorWithReasonCode } from 'mqtt'
import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react'
import type { BetterMQTT } from '..'

const ctx = createContext<BetterMQTT | null>(null)

export function BetterMQTTProvider(props: {
    children: ReactNode
    client: BetterMQTT
}) {
    return <ctx.Provider value={props.client}>{props.children}</ctx.Provider>
}

export function useMQTT() {
    const client = useContext(ctx)

    if (!client) {
        throw new Error('useMQTT must be used within MQTTProvider')
    }

    return client
}

export function useMQTTStatus() {
    const client = useMQTT()

    const [status, setStatus] = useState(client.status)

    useEffect(() => {
        const listener = client.on('status', setStatus)

        return () => {
            client.off('status', listener)
        }
    }, [client])

    return status
}

export function useMQTTSubscription<T>(
    topic: string,
    parser: (message: Buffer) => T,
    onMessage: (message: T) => void,
) {
    const client = useMQTT()

    const onMessageRef = useRef(onMessage)
    onMessageRef.current = onMessage
    const parserRef = useRef(parser)
    parserRef.current = parser

    const parserMemoed = useCallback((message: Buffer) => {
        return parserRef.current(message)
    }, [])

    useEffect(() => {
        const sub = client.subscribe<T>(topic, parserMemoed)

        sub.on('message', (message) => {
            onMessageRef.current(message.content)
        })

        return () => {
            sub.end()
        }
    }, [client, topic, parserMemoed])
}

export function useMQTTError(
    onError: (error: Error) => void,
): Error | ErrorWithReasonCode | null {
    const client = useMQTT()

    const [error, setError] = useState<Error | ErrorWithReasonCode | null>(null)

    useEffect(() => {
        const listener = (err: Error | ErrorWithReasonCode) => {
            setError(err)
            onError(err)
        }

        client.on('error', listener)

        return () => {
            client.off('error', listener)
        }
    }, [client, onError])

    return error
}
