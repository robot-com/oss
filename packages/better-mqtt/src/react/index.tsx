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
import type {
    BetterMQTT,
    BetterMQTTMessage,
    Subscription,
    SubscriptionOptions,
} from '..'

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

function areOptionsEqual(a: SubscriptionOptions, b: SubscriptionOptions) {
    return a.nl === b.nl && a.qos === b.qos && a.rap === b.rap && a.rh === b.rh
}

export function useMQTTSubscription<T>(
    topic: string,
    parser: (message: Buffer) => T,
    onMessage: (message: T) => void,
    opts?: {
        enabled?: boolean
    } & Partial<SubscriptionOptions>,
) {
    const client = useMQTT()

    const onMessageRef = useRef(onMessage)
    onMessageRef.current = onMessage
    const parserRef = useRef(parser)
    parserRef.current = parser

    const parserMemoed = useCallback((message: Buffer) => {
        return parserRef.current(message)
    }, [])

    // Ref to hold the active subscription and pending cleanup timeout
    // uniquely for this component instance.
    const subRef = useRef<{
        sub: Subscription<T> | null
        timeout: NodeJS.Timeout | null
    }>({ sub: null, timeout: null })

    // Destructure options to ensure we depend on primitive values, 
    // avoiding re-renders when the 'opts' object reference changes.
    const enabled = opts?.enabled ?? true
    const nl = opts?.nl ?? false
    const qos = opts?.qos ?? 2
    const rap = opts?.rap ?? false
    const rh = opts?.rh ?? 2

    useEffect(() => {
        if (!enabled) {
            return
        }

        const currentOptions: SubscriptionOptions = { nl, qos, rap, rh }
        let sub: Subscription<T>

        // Check if we can reuse the existing subscription from the ref
        // This handles React Strict Mode "Unmount -> Remount" cycle
        if (
            subRef.current.sub &&
            subRef.current.sub.topic === topic &&
            areOptionsEqual(subRef.current.sub.options, currentOptions)
        ) {
            sub = subRef.current.sub
            // Cancel any pending destruction
            if (subRef.current.timeout) {
                clearTimeout(subRef.current.timeout)
                subRef.current.timeout = null
            }
        } else {
            // Create a new subscription
            sub = client.subscribe<T>(topic, parserMemoed, {
                nl,
                qos,
                rap,
                rh,
            })
            subRef.current.sub = sub
        }

        const onMessage = (message: BetterMQTTMessage<T>) => {
            onMessageRef.current(message.content)
        }

        sub.on('message', onMessage)

        return () => {
            // Immediately stop listening to avoid side-effects in unmounted component
            sub.off('message', onMessage)

            // Defer the actual unsubscription to the next tick.
            // If the component is immediately re-mounted (e.g. Strict Mode),
            // the effect setup will run, see the ref, and cancel this timeout.
            const timeout = setTimeout(() => {
                sub.end()
                // Only nullify if it's still the exact same subscription
                if (subRef.current.sub === sub) {
                    subRef.current.sub = null
                    subRef.current.timeout = null
                }
            }, 0)

            subRef.current.timeout = timeout
        }
    }, [client, topic, parserMemoed, enabled, nl, qos, rap, rh])
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
