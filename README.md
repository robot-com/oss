# 🤖 Robot OSS

A collection of open-source tools and libraries for building modern robotics and IoT systems. Built with TypeScript, focusing on type safety, developer experience, and real-world reliability.

## 🚀 Packages

### [@robot.com/better-mqtt](./packages/better-mqtt/)

A modern, TypeScript-first MQTT client library that provides a better developer experience with async iterators, shared subscriptions, and React hooks.

**Key Features:**
- 🚀 Modern TypeScript API with async iterators
- 📡 Shared subscriptions and queue subscriptions
- 🎯 Wildcard topic matching with parameter extraction
- ⚡ Multiple parsers (string, JSON, binary)
- 🎣 First-class React integration
- 🔌 Built on top of mqtt.js

```typescript
import { BetterMQTT } from '@robot.com/better-mqtt'

const mqtt = await BetterMQTT.connectAsync({
  host: 'localhost',
  port: 1883,
  clientId: 'my-robot'
})

// Subscribe with async iterator
const subscription = mqtt.subscribeString('sensors/+/status')
for await (const message of subscription) {
  console.log(`Sensor ${message.params[0]}: ${message.content}`)
}
```

**[📖 Full Documentation](./packages/better-mqtt/README.md)**

### [@robot.com/rpc](./packages/rpc/)

A fully type-safe, modular RPC framework powered by [NATS.IO](https://nats.io) for building distributed systems and microservices.

**Key Features:**
- 🔒 End-to-end type safety with TypeScript and Zod
- 🧩 Modular architecture with procedure definitions
- 🚀 High performance with NATS work queues
- 🔄 Built-in retry logic and error handling
- 🌐 Transport agnostic design
- 🔐 Flexible middleware and authentication

```typescript
import { defineProcedure } from '@robot.com/rpc/client'

export const api = {
  getUser: defineProcedure({
    method: 'GET',
    path: 'users.$id',
    paramsSchema: z.object({ id: z.string() }),
    outputSchema: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string()
    })
  })
}
```

**[📖 Full Documentation](./packages/rpc/README.md)**

### [@robot.com/build-package](./packages/build-package/)

Internal build tooling for the Robot OSS monorepo, powered by [tsup](https://github.com/egoist/tsup) for fast TypeScript bundling.

### [@robot.com/publish-package](./packages/publish-package/)

Internal package publishing utilities for managing releases across the monorepo.

## 🛠️ Getting Started

### Prerequisites

- **Node.js** 18+ 
- **pnpm** 10.12.4+ (recommended package manager)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/robot-oss.git
cd robot-oss

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test
```

### Development

```bash
# Format code
pnpm format

# Build specific package
pnpm --filter @robot.com/better-mqtt build

# Run tests for specific package
pnpm --filter @robot.com/rpc test
```

## 🏗️ Project Structure

```
robot-oss/
├── packages/
│   ├── better-mqtt/          # MQTT client library
│   ├── rpc/                  # RPC framework
│   ├── build-package/        # Build tooling
│   └── publish-package/      # Publishing utilities
├── pnpm-workspace.yaml       # Workspace configuration
├── biome.json                # Code formatting and linting
└── tsconfig.json            # TypeScript configuration
```

## 🎯 Use Cases

### Robotics & IoT
- **Sensor Data Collection**: Use Better MQTT to collect data from distributed sensors
- **Robot Control**: Implement command/control systems with MQTT pub/sub
- **Load Balancing**: Use shared subscriptions for distributed robot control
- **Real-time Communication**: Low-latency messaging between robot components

### Microservices & Distributed Systems
- **Service Communication**: Use the RPC framework for inter-service calls
- **API Gateway**: Build type-safe APIs with automatic validation
- **Event Streaming**: Leverage NATS for reliable message delivery
- **Load Balancing**: Distribute work across multiple service instances

### Web Applications
- **Real-time Dashboards**: React hooks for live MQTT data visualization
- **Backend APIs**: Type-safe RPC endpoints with automatic validation
- **WebSocket Alternatives**: MQTT for real-time browser communication

## 🔧 Technology Stack

- **Language**: TypeScript
- **Package Manager**: pnpm
- **Build Tool**: tsup
- **Code Quality**: Biome
- **Testing**: Built-in test suites
- **Transport**: MQTT, NATS.IO
- **Validation**: Zod schemas

## 📚 Examples

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
    
    // Process commands
    this.processMovementCommands(movementSub)
  }
  
  private async processMovementCommands(subscription: Subscription) {
    for await (const message of subscription) {
      const { direction, speed } = message.content
      console.log(`Moving ${direction} at speed ${speed}`)
      // Execute robot movement
    }
  }
}
```

### Distributed Service Architecture

```typescript
import { defineProcedure } from '@robot.com/rpc/client'
import { Registry, startRpcNatsServer } from '@robot.com/rpc/server'

// Define your API
export const robotApi = {
  moveRobot: defineProcedure({
    method: 'POST',
    path: 'robot.move',
    inputSchema: z.object({
      direction: z.enum(['forward', 'backward', 'left', 'right']),
      speed: z.number().min(0).max(100)
    }),
    outputSchema: z.object({
      success: z.boolean(),
      newPosition: z.object({ x: z.number(), y: z.number() })
    })
  })
}

// Implement the service
const registry = new Registry()
registry.impl(robotApi.moveRobot, async ({ input }) => {
  // Execute robot movement
  const newPosition = await executeMovement(input)
  return { success: true, newPosition }
})
```

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Guidelines

- Follow the existing code style (enforced by Biome)
- Add tests for new functionality
- Update documentation for API changes
- Ensure all tests pass before submitting

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **[mqtt.js](https://github.com/mqttjs/MQTT.js)** - Excellent MQTT client library
- **[NATS.IO](https://nats.io)** - High-performance messaging system
- **[tsup](https://github.com/egoist/tsup)** - Fast TypeScript bundler
- **[Biome](https://biomejs.dev/)** - Fast formatter and linter

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/your-org/robot-oss/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/robot-oss/discussions)
- **Documentation**: Each package has its own detailed README

---

**Built with ❤️ for the robotics and IoT community**
