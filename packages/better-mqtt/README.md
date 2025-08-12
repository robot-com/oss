# Better MQTT

A modern, TypeScript-first MQTT client library that provides a better developer experience with async iterators, shared subscriptions, and React hooks. Better MQTT is a wrapper around the excellent [mqtt.js](https://github.com/mqttjs/MQTT.js) library, enhancing it with modern JavaScript features and a more developer-friendly API.

## Features

- 🚀 **Modern TypeScript API** - Built with TypeScript and modern JavaScript features
- 🔄 **Async Iterators** - Subscribe to topics and iterate over messages using `for await...of`
- 📡 **Shared Subscriptions** - Support for MQTT shared subscriptions (`$share/group/topic`) and queue subscriptions (`$queue/topic`)
- 🎯 **Topic Matching** - Extract parameters from wildcard topics (`+` and `#`)
- ⚡ **Multiple Parsers** - Built-in parsers for strings, JSON, and binary data
- 🎣 **React Hooks** - First-class React integration with hooks for MQTT operations
- 🔌 **Event Emitter** - Built on top of `ee-ts` for reliable event handling
- 🧪 **Fully Tested** - Comprehensive test coverage for all features
- ⚡ **Async Operations** - Both synchronous and asynchronous methods for all operations

## Installation

```bash
npm install @robot.com/better-mqtt
# or
pnpm add @robot.com/better-mqtt
# or
yarn add @robot.com/better-mqtt
# or
bun add @robot.com/better-mqtt
```

## Quick Start

### Basic Connection and Publishing

```typescript
import { BetterMQTT } from '@robot.com/better-mqtt'

// Connect to MQTT broker
const mqtt = await BetterMQTT.connectAsync({
  host: 'localhost',
  port: 1883,
  clientId: 'my-client'
})

// Publish messages
mqtt.publish('sensors/temperature', '23.5')
mqtt.publishJson('sensors/humidity', { value: 65, unit: '%' })

// Clean up
mqtt.end()
```

### Subscribing and Receiving Messages

```typescript
// Subscribe to a topic
const subscription = mqtt.subscribeString('sensors/temperature')

// Method 1: Using async iterator
for await (const message of subscription) {
  console.log(`Temperature: ${message.content}°C`)
  console.log(`Topic: ${message.topic}`)
  console.log(`Parameters: ${message.params}`)
  
  // Break after first message
  break
}

// Method 2: Using event listener
subscription.on('message', (message) => {
  console.log(`Temperature: ${message.content}°C`)
})

// Unsubscribe when done
subscription.end()
```

### Wildcard Topics with Parameter Extraction

```typescript
// Subscribe to wildcard topic with single level wildcard (+)
const subscription = mqtt.subscribeString('sensors/+/status')

// Publish to matching topics
mqtt.publish('sensors/temperature/status', 'online')
mqtt.publish('sensors/humidity/status', 'offline')

// Extract parameters from wildcards
for await (const message of subscription) {
  console.log(`Sensor: ${message.params[0]}`) // 'temperature' or 'humidity'
  console.log(`Status: ${message.content}`)   // 'online' or 'offline'
  console.log(`Full topic: ${message.topic}`) // 'sensors/temperature/status'
}

// Subscribe to multi-level wildcard (#)
const multiLevelSub = mqtt.subscribeString('sensors/+/data/#')

mqtt.publish('sensors/temperature/data/room1/2024', '23.5°C')

for await (const message of multiLevelSub) {
  console.log(`Sensor: ${message.params[0]}`)        // 'temperature'
  console.log(`Data path: ${message.params[1]}`)     // 'room1/2024'
  console.log(`Value: ${message.content}`)           // '23.5°C'
}
```

### JSON Messages

```typescript
interface SensorData {
  value: number
  unit: string
  timestamp: number
}

// Subscribe with JSON parser
const subscription = mqtt.subscribeJson<SensorData>('sensors/data')

// Publish JSON data
mqtt.publishJson('sensors/data', { 
  message: 'test message',
  value: 23.5,
  unit: '°C',
  timestamp: Date.now()
})

for await (const message of subscription) {
  const data = message.content // Typed as SensorData
  console.log(`${data.value}${data.unit} at ${new Date(data.timestamp)}`)
}
```

### Async Operations

```typescript
// Async connection
const mqtt = await BetterMQTT.connectAsync({
  host: 'localhost',
  port: 1883,
  clientId: 'async-client'
})

// Async subscription
const subscription = await mqtt.subscribeStringAsync('test/topic')

// Async publishing
await mqtt.publishAsync('test/topic', 'async message')
await mqtt.publishJsonAsync('test/json', { data: 'async json' })

// Process messages
for await (const message of subscription) {
  console.log('Received:', message.content)
  break
}
```

### Shared Subscriptions

```typescript
// Subscribe to shared topic (load balancing across multiple clients)
const subscription1 = mqtt1.subscribeString('$share/group1/commands/robot')
const subscription2 = mqtt2.subscribeString('$share/group1/commands/robot')

// Only one client in the group will receive each message
// This ensures load balancing across multiple workers
for await (const message of subscription1) {
  console.log(`Worker 1 received command: ${message.content}`)
}

// Publish multiple messages to test load balancing
await mqtt1.publishAsync('commands/robot', 'command 1')
await mqtt1.publishAsync('commands/robot', 'command 2')
await mqtt1.publishAsync('commands/robot', 'command 3')
await mqtt1.publishAsync('commands/robot', 'command 4')

// Each message will be received by only one of the subscribers
// ensuring no duplicate processing
```

### Queue Subscriptions

```typescript
// Subscribe to queue topic (round-robin distribution)
const subscription = mqtt.subscribeString('$queue/notifications/urgent')

// Messages are distributed round-robin among subscribers
for await (const message of subscription) {
  console.log(`Urgent notification: ${message.content}`)
}
```

### Multiple Subscriptions to Same Topic

```typescript
// Multiple clients can subscribe to the same topic
const sub1 = await mqtt1.subscribeStringAsync('test/better-mqtt/subscribe_3')
const sub2 = await mqtt2.subscribeStringAsync('test/better-mqtt/subscribe_3')

// Both will receive the same message
mqtt1.publish('test/better-mqtt/subscribe_3', 'test message')

// Process in first subscription
for await (const message of sub1) {
  console.log(`Sub1 received: ${message.content}`)
  break
}

// Process in second subscription
for await (const message of sub2) {
  console.log(`Sub2 received: ${message.content}`)
  break
}
```

### Unsubscribing and Cleanup

```typescript
// Subscribe to a topic
const subscription = await mqtt.subscribeStringAsync('test/topic')

// Publish and receive a message
mqtt.publish('test/topic', 'test message')

for await (const message of subscription) {
  console.log('Received:', message.content)
  break
}

// Unsubscribe from the topic
mqtt.unsubscribe(subscription)

// Publish another message (should not be received)
mqtt.publish('test/topic', 'this message should not be received')

// Verify no more messages are received
let received = false
for await (const _ of subscription) {
  received = true
}

console.log('Message received after unsubscribe:', received) // false
```

## React Integration

### Provider Setup

```tsx
import { BetterMQTTProvider } from '@robot.com/better-mqtt/react'

function App() {
  return (
    <BetterMQTTProvider options={{
      host: 'localhost',
      port: 1883,
      clientId: 'react-app'
    }}>
      <MyComponent />
    </BetterMQTTProvider>
  )
}
```

### Using MQTT in Components

```tsx
import { useMQTT, useMQTTStatus, useMQTTSubscription } from '@robot.com/better-mqtt/react'

function SensorDisplay() {
  const mqtt = useMQTT()
  const status = useMQTTStatus()
  
  // Subscribe to temperature updates
  useMQTTSubscription(
    'sensors/temperature',
    (message) => message.toString('utf8'),
    (temperature) => {
      console.log(`Temperature: ${temperature}°C`)
    }
  )
  
  // Publish commands
  const sendCommand = () => {
    mqtt.publish('commands/robot', 'start')
  }
  
  return (
    <div>
      <p>MQTT Status: {status}</p>
      <button onClick={sendCommand}>Send Command</button>
    </div>
  )
}
```

### Error Handling

```tsx
import { useMQTTError } from '@robot.com/better-mqtt/react'

function ErrorBoundary() {
  const error = useMQTTError((err) => {
    console.error('MQTT Error:', err)
  })
  
  if (error) {
    return <div>Connection Error: {error.message}</div>
  }
  
  return null
}
```

## API Reference

### BetterMQTT Class

#### Constructor
```typescript
new BetterMQTT(client: MqttClient)
```

#### Static Methods

##### `connect(options: IClientOptions): BetterMQTT`
Creates a new BetterMQTT instance with synchronous connection.

##### `connectAsync(options: IClientOptions): Promise<BetterMQTT>`
Creates a new BetterMQTT instance with asynchronous connection.

#### Instance Methods

##### `subscribe<T>(topic: string, parser: MessageParser<T>): Subscription<T>`
Subscribes to a topic with a custom message parser.

##### `subscribeString(topic: string): Subscription<string>`
Subscribes to a topic with string message parsing.

##### `subscribeJson<T>(topic: string): Subscription<T>`
Subscribes to a topic with JSON message parsing.

##### `subscribeBinary(topic: string): Subscription<Buffer>`
Subscribes to a topic with binary message parsing.

##### `subscribeAsync<T>(topic: string, parser: MessageParser<T>): Promise<Subscription<T>>`
Asynchronously subscribes to a topic with a custom message parser.

##### `subscribeStringAsync(topic: string): Promise<Subscription<string>>`
Asynchronously subscribes to a topic with string message parsing.

##### `subscribeJsonAsync<T>(topic: string): Promise<Subscription<T>>`
Asynchronously subscribes to a topic with JSON message parsing.

##### `subscribeBinaryAsync(topic: string): Promise<Subscription<Buffer>>`
Asynchronously subscribes to a topic with binary message parsing.

##### `publish(topic: string, message: string | Buffer, opts?: { qos?: 0 | 1 | 2 }): void`
Publishes a message to a topic.

##### `publishAsync(topic: string, message: string | Buffer): Promise<void>`
Asynchronously publishes a message to a topic.

##### `publishJson<T>(topic: string, message: T): void`
Publishes a JSON message to a topic.

##### `publishJsonAsync<T>(topic: string, message: T): Promise<void>`
Asynchronously publishes a JSON message to a topic.

##### `unsubscribe(subscription: Subscription<unknown>): void`
Unsubscribes from a topic.

##### `end(): void`
Closes the MQTT connection.

#### Properties

##### `status: 'online' | 'offline'`
Current connection status.

##### `client: MqttClient`
Underlying MQTT client instance.

#### Events

##### `status(status: 'online' | 'offline')`
Emitted when connection status changes.

##### `error(error: Error | ErrorWithReasonCode)`
Emitted when an error occurs.

##### `end()`
Emitted when the connection ends.

### Subscription Class

#### Properties

##### `topic: string`
The subscribed topic.

##### `parser: (message: Buffer) => T`
The message parser function.

#### Methods

##### `end(): void`
Ends the subscription.

#### Events

##### `message(message: BetterMQTTMessage<T>)`
Emitted when a message is received.

##### `end()`
Emitted when the subscription ends.

##### `error(error: Error)`
Emitted when an error occurs.

#### Async Iterator

Subscriptions implement the async iterator protocol:

```typescript
for await (const message of subscription) {
  // Process message
}
```

### Message Parsers

#### Built-in Parsers

##### `stringParser(message: Buffer): string`
Converts Buffer to UTF-8 string.

##### `jsonParser<T>(message: Buffer): T`
Parses Buffer as JSON.

##### `binaryParser(message: Buffer): Buffer`
Returns Buffer as-is.

#### Custom Parsers

```typescript
function customParser(message: Buffer): MyType {
  // Custom parsing logic
  return parseMyType(message)
}

const subscription = mqtt.subscribe('my/topic', customParser)
```

### Topic Matching

The `matchTopic` function extracts parameters from wildcard topics:

```typescript
import { matchTopic } from '@robot.com/better-mqtt'

// Single level wildcard
const match = matchTopic('sensors/temp123/status', 'sensors/+/status')
console.log(match?.params) // ['temp123']

// Multi-level wildcard
const match2 = matchTopic('sensors/temp/room1/status', 'sensors/+/#')
console.log(match2?.params) // ['temp', 'room1/status']

// Shared subscription
const match3 = matchTopic('commands/robot', '$share/group1/commands/+')
console.log(match3?.params) // ['robot']

// Queue subscription
const match4 = matchTopic('notifications/urgent', '$queue/notifications/+')
console.log(match4?.params) // ['urgent']
```

## Examples

### Robot Control System

```typescript
import { BetterMQTT } from '@robot.com/better-mqtt'

class RobotController {
  private mqtt: BetterMQTT
  
  constructor() {
    this.mqtt = BetterMQTT.connect({
      host: 'robot-broker.local',
      clientId: 'robot-controller'
    })
    
    this.setupSubscriptions()
  }
  
  private setupSubscriptions() {
    // Listen for movement commands
    const movementSub = this.mqtt.subscribeJson<{
      direction: 'forward' | 'backward' | 'left' | 'right'
      speed: number
    }>('robot/movement')
    
    // Listen for sensor data
    const sensorSub = this.mqtt.subscribeJson<{
      temperature: number
      battery: number
      position: { x: number; y: number }
    }>('robot/sensors/+')
    
    // Process messages
    this.processMovementCommands(movementSub)
    this.processSensorData(sensorSub)
  }
  
  private async processMovementCommands(subscription: Subscription) {
    for await (const message of subscription) {
      const { direction, speed } = message.content
      console.log(`Moving ${direction} at speed ${speed}`)
      // Execute robot movement
    }
  }
  
  private async processSensorData(subscription: Subscription) {
    for await (const message of subscription) {
      const sensorType = message.params[0] // Extract from wildcard
      const data = message.content
      
      console.log(`${sensorType} sensor:`, data)
      
      // Publish processed data
      this.mqtt.publishJson(`robot/processed/${sensorType}`, {
        ...data,
        timestamp: Date.now(),
        processed: true
      })
    }
  }
  
  public sendCommand(command: string) {
    this.mqtt.publish('robot/commands', command)
  }
  
  public cleanup() {
    this.mqtt.end()
  }
}
```

### IoT Device Monitor

```typescript
import { BetterMQTT } from '@robot.com/better-mqtt'

class IoTMonitor {
  private mqtt: BetterMQTT
  private devices = new Map<string, DeviceStatus>()
  
  constructor() {
    this.mqtt = BetterMQTT.connect({
      host: 'iot-broker.local',
      clientId: 'monitor'
    })
    
    this.setupMonitoring()
  }
  
  private setupMonitoring() {
    // Monitor all device statuses
    const statusSub = this.mqtt.subscribeString('devices/+/status')
    
    // Monitor device data
    const dataSub = this.mqtt.subscribeJson('devices/+/data')
    
    this.monitorDeviceStatus(statusSub)
    this.monitorDeviceData(dataSub)
  }
  
  private async monitorDeviceStatus(subscription: Subscription) {
    for await (const message of subscription) {
      const deviceId = message.params[0]
      const status = message.content
      
      this.devices.set(deviceId, { status, lastSeen: Date.now() })
      
      // Alert if device goes offline
      if (status === 'offline') {
        this.mqtt.publishJson('alerts/device', {
          deviceId,
          type: 'offline',
          timestamp: Date.now()
        })
      }
    }
  }
  
  private async monitorDeviceData(subscription: Subscription) {
    for await (const message of subscription) {
      const deviceId = message.params[0]
      const data = message.content
      
      // Process and store device data
      console.log(`Device ${deviceId} data:`, data)
      
      // Forward to data processing pipeline
      this.mqtt.publishJson('data/processed', {
        deviceId,
        data,
        timestamp: Date.now()
      })
    }
  }
  
  public getDeviceStatus(deviceId: string) {
    return this.devices.get(deviceId)
  }
  
  public getAllDevices() {
    return Array.from(this.devices.entries())
  }
}
```

### Load Balanced Worker System

```typescript
import { BetterMQTT } from '@robot.com/better-mqtt'

class Worker {
  private mqtt: BetterMQTT
  private workerId: string
  
  constructor(workerId: string) {
    this.workerId = workerId
    this.mqtt = BetterMQTT.connect({
      host: 'worker-broker.local',
      clientId: `worker-${workerId}`
    })
    
    this.setupWorkQueue()
  }
  
  private setupWorkQueue() {
    // Subscribe to shared work queue
    const workQueue = this.mqtt.subscribeString('$share/workers/jobs/process')
    
    this.processJobs(workQueue)
  }
  
  private async processJobs(subscription: Subscription) {
    for await (const message of subscription) {
      const job = message.content
      console.log(`Worker ${this.workerId} processing job: ${job}`)
      
      // Process the job
      await this.processJob(job)
      
      // Publish completion
      this.mqtt.publishJson('jobs/completed', {
        workerId: this.workerId,
        job,
        timestamp: Date.now()
      })
    }
  }
  
  private async processJob(job: string) {
    // Simulate job processing
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  public cleanup() {
    this.mqtt.end()
  }
}

// Create multiple workers
const worker1 = new Worker('worker-1')
const worker2 = new Worker('worker-2')
const worker3 = new Worker('worker-3')

// Jobs will be distributed among workers automatically
```

## Error Handling

### Connection Errors

```typescript
const mqtt = BetterMQTT.connect({
  host: 'invalid-host',
  port: 1883
})

mqtt.on('error', (error) => {
  console.error('Connection error:', error.message)
  
  if (error.code === 'ENOTFOUND') {
    console.log('Host not found, retrying...')
    // Implement retry logic
  }
})
```

### Subscription Errors

```typescript
const subscription = mqtt.subscribeString('test/topic')

subscription.on('error', (error) => {
  console.error('Subscription error:', error.message)
  // Handle subscription-specific errors
})
```

### Message Parsing Errors

```typescript
function safeJsonParser<T>(message: Buffer): T | null {
  try {
    return JSON.parse(message.toString('utf8'))
  } catch (error) {
    console.error('Failed to parse JSON:', error)
    return null
  }
}

const subscription = mqtt.subscribe('test/topic', safeJsonParser)

for await (const message of subscription) {
  if (message.content === null) {
    console.log('Skipping invalid message')
    continue
  }
  
  // Process valid message
  console.log('Valid message:', message.content)
}
```

## Best Practices

### 1. Always Clean Up Subscriptions

```typescript
const subscription = mqtt.subscribeString('my/topic')

try {
  for await (const message of subscription) {
    // Process message
    if (shouldStop) break
  }
} finally {
  subscription.end() // Clean up
}
```

### 2. Use Shared Subscriptions for Load Balancing

```typescript
// Instead of multiple clients subscribing to the same topic
const subscription = mqtt.subscribeString('$share/workers/queue/jobs')

// This ensures only one worker processes each job
```

### 3. Handle Connection Status

```typescript
mqtt.on('status', (status) => {
  if (status === 'offline') {
    console.log('Connection lost, implementing reconnection...')
    // Implement reconnection logic
  } else if (status === 'online') {
    console.log('Reconnected successfully')
    // Restore subscriptions
  }
})
```

### 4. Use Appropriate QoS Levels

```typescript
// High reliability for critical messages
mqtt.publish('alerts/critical', 'System failure', { qos: 2 })

// Lower overhead for frequent updates
mqtt.publish('sensors/temperature', '23.5', { qos: 0 })
```

### 5. Implement Proper Error Boundaries in React

```tsx
function MQTTErrorBoundary({ children }: { children: ReactNode }) {
  const error = useMQTTError((err) => {
    // Log error to monitoring service
    console.error('MQTT Error:', err)
  })
  
  if (error) {
    return <div>Connection Error: {error.message}</div>
  }
  
  return <>{children}</>
}
```

### 6. Use Async Methods for Better Performance

```typescript
// For better performance in async contexts
const subscription = await mqtt.subscribeStringAsync('my/topic')
await mqtt.publishAsync('my/topic', 'message')

// Instead of synchronous versions
const subscription = mqtt.subscribeString('my/topic')
mqtt.publish('my/topic', 'message')
```

### 7. Handle Wildcard Parameters Safely

```typescript
const subscription = mqtt.subscribeString('sensors/+/data/+')

for await (const message of subscription) {
  // Always check params length before accessing
  if (message.params.length >= 2) {
    const sensorType = message.params[0]
    const dataType = message.params[1]
    
    console.log(`${sensorType} sensor ${dataType}: ${message.content}`)
  }
}
```

## Acknowledgments

Better MQTT is built on top of the excellent [mqtt.js](https://github.com/mqttjs/MQTT.js) library, which provides the core MQTT functionality. We extend our thanks to the mqtt.js contributors for their outstanding work on the underlying MQTT client implementation.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see the [LICENSE](../../LICENSE) file for details.

## AI Slop Warning

This docs was partially generated by AI. All the code (including tests) was written by hand.