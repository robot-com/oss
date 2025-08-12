# RPC Framework

A fully type-safe, modular RPC framework powered by [NATS.IO](https://nats.io) for building distributed systems and microservices.

## Features

- **🔒 Fully Type Safe** - Built with TypeScript and Zod for end-to-end type safety
- **🧩 Modular Architecture** - Separate procedure definitions from implementations
- **🚀 High Performance** - Optimized for scalable type inference and performance
- **🔄 Built-in Retry Logic** - NATS work queues with automatic retry on failure
- **🌐 Transport Agnostic** - Designed to work with HTTP, NATS, and WebSockets (WIP)
- **🔐 Middleware Support** - Flexible context and authentication handling
- **📝 Schema Validation** - Automatic input/output validation with Zod schemas

## Installation

```bash
npm install @robot.com/rpc
# or
pnpm add @robot.com/rpc
# or
yarn add @robot.com/rpc
# or
bun add @robot.com/rpc
```

## Quick Start

### 1. Define Your API

```typescript
import { defineProcedure } from '@robot.com/rpc/client'
import { z } from 'zod'

// Define your API procedures
export const api = {
  // GET /users/:id
  getUser: defineProcedure({
    method: 'GET',
    path: 'users.$id',
    paramsSchema: z.object({ id: z.string() }),
    outputSchema: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string()
    })
  }),

  // POST /users
  createUser: defineProcedure({
    method: 'POST',
    path: 'users',
    inputSchema: z.object({
      name: z.string(),
      email: z.string()
    }),
    outputSchema: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string()
    })
  }),

  // PUT /users/:id
  updateUser: defineProcedure({
    method: 'PUT',
    path: 'users.$id',
    paramsSchema: z.object({ id: z.string() }),
    inputSchema: z.object({
      name: z.string().optional(),
      email: z.string().optional()
    }),
    outputSchema: z.object({
      id: z.string(),
      name: z.string(),
      email: z.string()
    })
  })
}
```

### 2. Implement Your Server

```typescript
import { Registry, startRpcNatsServer } from '@robot.com/rpc/server'
import { connect } from '@nats-io/transport-node'
import { jetstream } from '@nats-io/jetstream'
import { RPCError } from '@robot.com/rpc'
import { api } from './api'

// Create a registry to manage your procedures
const registry = new Registry({
  initialContext: null,
  middleware: async (_, req) => {
    // Add authentication, logging, or other middleware logic
    const authHeader = req.msg?.headers?.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new RPCError('UNAUTHORIZED', 'Missing or invalid authorization token')
    }
    
    return {
      userId: authHeader.replace('Bearer ', ''),
      timestamp: new Date().toISOString()
    }
  }
})

// Implement your procedures
registry
  .impl(api.getUser, async ({ ctx, params }) => {
    // Fetch user from database
    const user = await getUserFromDatabase(params.id)
    if (!user) {
      throw new RPCError('NOT_FOUND', 'User not found')
    }
    
    return { data: user }
  })
  .impl(api.createUser, async ({ ctx, input }) => {
    // Create new user
    const user = await createUserInDatabase(input)
    return { data: user }
  })
  .impl(api.updateUser, async ({ ctx, params, input }) => {
    // Update existing user
    const user = await updateUserInDatabase(params.id, input)
    if (!user) {
      throw new RPCError('NOT_FOUND', 'User not found')
    }
    
    return { data: user }
  })

// Setup NATS connection
const natsConnection = await connect({
  servers: [process.env.NATS_URL!],
  token: process.env.NATS_TOKEN
})

// Setup JetStream for reliable message delivery
const js = jetstream(natsConnection)
const manager = await js.jetstreamManager()

// Create stream for RPC requests
await manager.streams.add({
  name: 'rpc_requests',
  subjects: ['rpc.requests.>'],
  retention: 'workqueue'
})

// Create consumer for processing requests
await manager.consumers.add('rpc_requests', {
  name: 'handler',
  durable_name: 'handler',
  ack_policy: 'explicit'
})

// Start the RPC server
const server = await startRpcNatsServer({
  nats: natsConnection,
  streamName: 'rpc_requests',
  consumerName: 'handler',
  subjectPrefix: 'rpc.requests.',
  registry
})

console.log('RPC Server started successfully')

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down RPC server...')
  await server.stop()
  await natsConnection.drain()
  process.exit(0)
})
```

### 3. Create Your Client

```typescript
import { RPCClientNATS } from '@robot.com/rpc/client'
import { connect } from '@nats-io/transport-node'
import { api } from './api'

// Connect to NATS
const natsConnection = await connect({
  servers: [process.env.NATS_URL!],
  token: process.env.NATS_TOKEN
})

// Create RPC client
const client = new RPCClientNATS({
  nats: natsConnection,
  publishPrefix: 'rpc.requests.',
  headers: {
    Authorization: 'Bearer your-auth-token'
  }
})

// Call your procedures
try {
  // Get user
  const user = await client.call(api.getUser, {
    params: { id: '123' }
  })
  console.log('User:', user.name)

  // Create user
  const newUser = await client.call(api.createUser, {
    input: {
      name: 'John Doe',
      email: 'john@example.com'
    }
  })
  console.log('Created user:', newUser.id)

  // Update user
  const updatedUser = await client.call(api.updateUser, {
    params: { id: '123' },
    input: { name: 'Jane Doe' }
  })
  console.log('Updated user:', updatedUser.name)

} catch (error) {
  if (error.code === 'NOT_FOUND') {
    console.error('User not found')
  } else if (error.code === 'UNAUTHORIZED') {
    console.error('Authentication failed')
  } else {
    console.error('RPC call failed:', error.message)
  }
}

// Clean up
await natsConnection.drain()
```

## API Reference

### Core Types

#### `defineProcedure(options)`

Creates a new procedure definition with full type safety.

```typescript
defineProcedure({
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string, // e.g., 'users.$id' or 'posts.$category.$id'
  paramsSchema?: ZodSchema, // URL parameters validation
  inputSchema?: ZodSchema,  // Request body validation
  outputSchema: ZodSchema   // Response validation
})
```

**Path Parameters:**
- Use `$paramName` for dynamic segments
- Special `$method` parameter maps HTTP methods to NATS subjects:
  - `GET` → `get`
  - `POST` → `create`
  - `PUT` → `do`
  - `PATCH` → `update`
  - `DELETE` → `delete`

#### `Registry`

Manages procedure implementations and routing.

```typescript
const registry = new Registry({
  initialContext: InitialContextType,
  middleware: (initialContext, request) => Promise<ContextType>
})

// Add implementations
registry.impl(procedure, handler)

// Merge registries
registry.merge(otherRegistry)
```

#### `RPCClientNATS`

NATS-based RPC client implementation.

```typescript
const client = new RPCClientNATS({
  nats: NatsConnection,
  publishPrefix: string,
  headers?: Record<string, string>
})

// Make calls
await client.call(procedure, {
  params?: ParamsType,
  input?: InputType,
  signal?: AbortSignal,
  timeout?: number
})
```

### Error Handling

The framework provides comprehensive error handling with standard HTTP status codes:

```typescript
import { RPCError } from '@robot.com/rpc'

// Common error types
throw new RPCError('NOT_FOUND', 'Resource not found')
throw new RPCError('UNAUTHORIZED', 'Authentication required')
throw new RPCError('BAD_REQUEST', 'Invalid input data')
throw new RPCError('INTERNAL_SERVER_ERROR', 'Something went wrong')

// Custom error handling
try {
  const result = await client.call(api.getUser, { params: { id: '123' } })
} catch (error) {
  if (RPCError.isRPCError(error)) {
    switch (error.code) {
      case 'NOT_FOUND':
        console.log('User not found')
        break
      case 'UNAUTHORIZED':
        console.log('Please log in')
        break
      default:
        console.log('Error:', error.message)
    }
  }
}
```

### Middleware and Context

```typescript
const registry = new Registry({
  initialContext: { version: '1.0.0' },
  middleware: async (initialContext, req) => {
    // Add authentication
    const token = req.msg?.headers?.get('Authorization')
    const user = await validateToken(token)
    
    // Add request metadata
    return {
      ...initialContext,
      user,
      requestId: crypto.randomUUID(),
      timestamp: new Date()
    }
  }
})

// Use context in handlers
registry.impl(api.getUser, async ({ ctx, params }) => {
  console.log(`User ${ctx.user.id} requesting user ${params.id}`)
  // ... handler logic
})
```

## Advanced Usage

### Custom Timeouts and Abort Signals

```typescript
// Set custom timeout
const result = await client.call(api.getUser, {
  params: { id: '123' },
  timeout: 5000 // 5 seconds
})

// Use AbortController for cancellation
const controller = new AbortController()
setTimeout(() => controller.abort(), 3000)

try {
  const result = await client.call(api.getUser, {
    params: { id: '123' },
    signal: controller.signal
  })
} catch (error) {
  if (error.message === 'Aborted') {
    console.log('Request was cancelled')
  }
}
```

### Batch Operations

```typescript
// Process multiple requests concurrently
const userIds = ['1', '2', '3', '4', '5']
const userPromises = userIds.map(id => 
  client.call(api.getUser, { params: { id } })
)

const users = await Promise.all(userPromises)
console.log(`Retrieved ${users.length} users`)
```

### Registry Composition

```typescript
// Create modular registries
const userRegistry = new Registry({ /* ... */ })
  .impl(api.getUser, getUserHandler)
  .impl(api.createUser, createUserHandler)

const postRegistry = new Registry({ /* ... */ })
  .impl(api.getPost, getPostHandler)
  .impl(api.createPost, createPostHandler)

// Combine them
const mainRegistry = new Registry({ /* ... */ })
  .merge(userRegistry)
  .merge(postRegistry)
```

## Configuration

### Environment Variables

```bash
# NATS connection
NATS_URL=nats://localhost:4222
NATS_TOKEN=your-nats-token

# RPC configuration
RPC_STREAM_NAME=rpc_requests
RPC_SUBJECT_PREFIX=rpc.requests.
RPC_CONSUMER_NAME=handler
```

### NATS Stream Configuration

```typescript
// Recommended stream settings for production
await manager.streams.add({
  name: 'rpc_requests',
  subjects: ['rpc.requests.>'],
  retention: 'workqueue',        // Ensures message delivery
  max_msgs_per_subject: 1000,    // Limit messages per subject
  max_age: 3600000000000,        // 1 hour TTL
  storage: 'memory'              // or 'file' for persistence
})
```

## Best Practices

1. **Type Safety**: Always define schemas for params, input, and output
2. **Error Handling**: Use appropriate error codes and meaningful messages
3. **Middleware**: Implement authentication and logging in middleware
4. **Resource Management**: Properly drain NATS connections on shutdown
5. **Monitoring**: Add metrics and logging for production deployments
6. **Testing**: Use the built-in testing utilities for procedure validation

## Examples

See the `src/tests/` directory for comprehensive examples of:
- Basic procedure definitions and implementations
- Full NATS server/client integration
- Error handling and middleware usage
- Authentication and authorization patterns

## Contributing

This package is part of the Robot OSS project. Contributions are welcome!

## License

MIT License - see LICENSE file for details.
