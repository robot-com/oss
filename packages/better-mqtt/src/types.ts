export interface BetterMQTTMessage<T> {
    topic: string
    content: T
    params: string[]
}

/**
 * MQTT subscription options
 */
export interface SubscriptionOptions {
    /**
     * MQTT QoS
     */
    qos: 0 | 1 | 2
    /**
     * MQTT Retain handling
     */
    rh: 0 | 1 | 2
    /**
     * MQTT Retain as published
     */
    rap: boolean
    /**
     * MQTT No local
     */
    nl: boolean
}
