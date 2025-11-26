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
     * MQTT QoS. Default: 2
     */
    qos: 0 | 1 | 2
    /**
     * MQTT Retain handling. Default: 2
     */
    rh: 0 | 1 | 2
    /**
     * MQTT Retain as published. Default: false
     */
    rap: boolean
    /**
     * MQTT No local. Default: false
     */
    nl: boolean
}
