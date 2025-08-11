export const connectOptions = {
    host: process.env.MQTT_HOST!,
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASS,
    protocolVersion: 5,
    protocol: 'mqtts',
    port: 8883,
    clean: true,
} as const

export const TEST_TIMEOUT = 5000
