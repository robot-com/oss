# Reliable Backend Framework (RBF) Documentation

**Organization:** robot.com  
**Version:** 1.0.0

## Table of Contents

1.  [Introduction](#1-introduction)
    *   [What is RBF?](#what-is-rbf)
    *   [Core Principles](#core-principles)
2.  [Core Concepts](#2-core-concepts)
    *   [Mutations](#mutations)
    *   [Queries](#queries)
    *   [Queues](#queues)
    *   [The Scheduler](#the-scheduler)
3.  [Getting Started](#3-getting-started)
    *   [Installation](#installation)
    *   [Defining the Backend](#defining-the-backend)
    *   [Creating and Running the Backend Instance](#creating-and-running-the-backend-instance)
4.  [API Reference](#4-api-reference)
    *   [`defineBackend<Context, Schema>`](#definebackendcontext-schema)
    *   [`createBackend(app, options)`](#createbackendapp-options)
    *   [`app.mutation(queueName, definition)`](#appmutationqueuename-definition)
    *   [`app.query(queueName, definition)`](#appqueryqueuename-definition)
    *   [The `backend` Instance](#the-backend-instance)
5.  [Advanced Topics](#5-advanced-topics)
    *   [Atomicity & The Transactional Outbox Pattern](#atomicity--the-transactional-outbox-pattern)
    *   [Idempotency and Deduplication](#idempotency-and-deduplication)
    *   [Middleware](#middleware)
    *   [Caching Queries](#caching-queries)
    *   [Interacting with NATS Directly](#interacting-with-nats-directly)
6.  [Full Example: User Signup Flow](#6-full-example-user-signup-flow)

---

## 1. Introduction

### What is RBF?

The Reliable Backend Framework (RBF) is a TypeScript framework for building robust, scalable, and fault-tolerant server-side applications. It is designed around a core set of primitives (**Mutations**, **Queries**, and **Queues**) that ensure data consistency and operational reliability, even in distributed environments.

By leveraging PostgreSQL for transactional integrity and NATS for message passing, RBF provides a simple yet powerful abstraction for complex backend logic.

### Core Principles

*   **Simplicity:** The developer API is designed to be minimal and intuitive. You define your logic, and the framework handles the complex orchestration of transactions, message queues, and retries.
*   **Reliability:** Every operation is built on a foundation of atomicity. Mutations are guaranteed to either complete fully or not at all, and any side-effects (like enqueuing subsequent jobs) are transactionally consistent.
*   **Scalability:** By using a message queue (NATS) as the transport layer, RBF services can be scaled horizontally. Workers can be added to any queue to increase processing throughput.
*   **Idempotency:** The framework has built-in mechanisms to prevent the same operation from being executed multiple times, protecting your system from common distributed system pitfalls.

## 2. Core Concepts

### Mutations

A **Mutation** is an operation that modifies server-state (e.g., creating, updating, or deleting data in a database).

Key characteristics of a Mutation in RBF:

*   **Transactional:** Each mutation handler runs within a `SERIALIZABLE` PostgreSQL transaction, guaranteeing the highest level of data consistency.
*   **Atomic:** The entire operation, including any side-effects enqueued via the scheduler, is atomic. If the mutation's database logic fails, any scheduled follow-up tasks are discarded.
*   **Asynchronous:** Mutations are typically invoked by placing a message on a queue. They can be scheduled to run immediately, after a delay, or at a specific time.

### Queries

A **Query** is an operation that retrieves data from the server without modifying its state.

Key characteristics of a Query in RBF:

*   **Read-Only:** Queries are guaranteed not to alter any data.
*   **Transactional:** Like mutations, queries run inside a database transaction to ensure a consistent, atomic view of the data at a single point in time.
*   **Cannot Schedule Side-Effects:** To enforce their read-only nature, queries do not have access to the `scheduler` and cannot enqueue other mutations or queries.
*   **Cacheable:** Queries can be configured with caching strategies to improve performance and reduce database load.

### Queues

Queues are the backbone of RBF's communication and workload management. They are logical channels, backed by NATS streams, where messages are sent to trigger Mutations or Queries.

You define queues when you initialize your application. Each queue can have its own configuration, such as middleware for authentication or logging.

### The Scheduler

The `scheduler` is a special object available only within Mutation handlers. It is the interface for defining the side-effects of a mutation. It allows you to enqueue follow-up tasks that will only be executed if the current mutation's transaction commits successfully.

This is the key to building complex, multi-step workflows that are fully atomic and reliable.

## 3. Getting Started

### Installation

```bash
npm install @robot.com/reliable-backend-framework zod drizzle-orm postgres nats
```

### Defining the Backend

The first step is to define the structure of your application using `defineBackend`. This function types your application and declares its queues and their associated middleware.

`app.ts`:
```ts
import { defineBackend } from 'rbf-framework';
import { z } from 'zod';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { NatsConnection, Msg } from 'nats';

// 1. Define your application's shared context (optional)
// This can hold things like a logger, API clients, etc.
export type AppContext = {
  logger: {
    info: (msg: string) => void;
    error: (msg: string, err: Error) => void;
  };
};

// 2. Define your Drizzle schema (or import it)
export type AppSchema = typeof import('./db/schema');

// 3. Define the backend application
export const app = defineBackend<AppContext, AppSchema>({
  queues: {
    // A queue for handling general jobs
    jobs: {
      middleware: async (ctx, db, msg) => {
        // This middleware runs for every message on the 'jobs' queue.
        // It can be used for authentication, logging, or enriching the context.
        console.log(`Received job with ID: ${msg.headers?.get('Nats-Msg-Id')}`);

        // You can perform DB lookups here.
        const user = { id: '1', name: 'John Doe' }; // Example: fetch user

        // Return a new context that will be passed to the handler.
        return { ...ctx, user };
      },
    },
    // A queue for domain events, with no middleware
    events: {},
  },
});

// Define a type for the enriched context after middleware
export type JobsContext = Awaited<
  ReturnType<typeof app.queues.jobs.middleware>
>;
```

### Creating and Running the Backend Instance

Once the app is defined, you create a runnable instance with `createBackend`. This is where you connect your abstract definition to concrete implementations like a database connection and NATS clients.

`main.ts`:
```ts
import { createBackend } from 'rbf-framework';
import { app, AppContext } from './app';
import { connect as connectToNats } from 'nats';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './db/schema';

async function main() {
  // 1. Establish connections to external services
  const natsConnection = await connectToNats({ servers: 'nats://localhost:4222' });
  const pool = new Pool({ connectionString: 'postgres://user:pass@host:port/db' });
  const db = drizzle(pool, { schema });

  // 2. Create the backend instance
  const backend = await createBackend(app, {
    // Provide the initial context object
    context: {
      logger: {
        info: console.log,
        error: console.error,
      },
    },
    db,
    // Map queue names to concrete NATS queue implementations
    queues: {
      jobs: natsQueue(natsConnection, 'jobs-stream'),
      events: natsQueue(natsConnection, 'events-stream'),
    },
  });

  // 3. Start the backend
  // This subscribes to all NATS subjects for the defined mutations and queries.
  await backend.start();
  console.log('RBF backend is running...');

  // Graceful shutdown
  process.on('SIGINT', () => backend.stop());
  process.on('SIGTERM', () => backend.stop());

  // The backend will now listen for and process messages indefinitely.
}

main().catch(console.error);
```

## 4. API Reference

### `defineBackend<Context, Schema>`

Creates an application definition.

*   **`Context`**: A generic type parameter for the shared context object available in all operations.
*   **`Schema`**: A generic type parameter for your Drizzle ORM schema.
*   **`options.queues`**: An object where keys are queue names and values are queue definitions. A queue definition can contain:
    *   `middleware`: An optional async function that runs before the handler. It receives `(ctx: Context, db: PgTransaction, msg: Message)` and must return a new context object.

### `createBackend(app, options)`

Creates a runnable backend instance from an application definition.

*   **`app`**: The application definition returned by `defineBackend`.
*   **`options`**:
    *   `context`: The initial context object.
    *   `db`: A configured Drizzle instance.
    *   `queues`: An object mapping the queue names from the definition to concrete queue client implementations (e.g., `natsQueue(...)`).

### `app.mutation(queueName, definition)`

Defines a mutation and registers it with the application.

*   **`queueName`**: The name of the queue this mutation will listen on. Must be a key in the `queues` object of the app definition.
*   **`definition`**: An object with the following properties:
    *   `path`: A string defining the "address" of the mutation. It follows a dot-notation convention and can include dynamic parameters prefixed with `$`, like `'users.create'` or `'posts.update.$postId'`. These parameters are automatically parsed and passed to the handler.
    *   `input`: An optional Zod schema for validating the incoming message payload. Defaults to `z.null()`.
    *   `output`: An optional Zod schema for validating the return value of the handler.
    *   `handler`: The async function containing the business logic. It receives a single object argument with the following properties:
        *   `ctx`: The context, potentially enriched by middleware.
        *   `db`: The Drizzle `PgTransaction` instance for this operation.
        *   `scheduler`: An object with methods to enqueue follow-up tasks (`enqueue`, `runAfter`, `runAt`, `publish`).
        *   `input`: The validated input payload.
        *   `params`: An object containing the parsed parameters from the `path`.

**Example:**

```ts
import { app, JobsContext } from './app';
import { z } from 'zod';

export const createUser = app.mutation('jobs', {
  path: 'users.create',
  input: z.object({
    email: z.string().email(),
    name: z.string(),
  }),
  output: z.object({
    id: z.string(),
  }),
  handler: async ({ ctx, db, scheduler, input, params }) => {
    // ctx is of type JobsContext here, because it's on the 'jobs' queue
    ctx.logger.info(`Creating user ${input.name}`);

    const [newUser] = await db
      .insert(users)
      .values({ name: input.name, email: input.email })
      .returning();

    // Enqueue a follow-up job that will only run if this transaction commits
    scheduler.enqueue(sendWelcomeEmail, {
      input: { userId: newUser.id },
    });

    return { id: newUser.id };
  },
});

// A reference to another mutation
const sendWelcomeEmail = app.mutation(/* ... */);
```

### `app.query(queueName, definition)`

Defines a query. The API is nearly identical to `app.mutation`, with a few key differences in the handler.

*   **`handler`**: The handler function receives an object with:
    *   `ctx`: The context.
    *   `db`: The read-only `PgTransaction` instance.
    *   `cache`: An object with methods to control caching (`get`, `set`, `invalidate`).
    *   `input`: The validated input.
    *   `params`: The parsed path parameters.
    *   **Note:** The `scheduler` object is **not** available in query handlers.

**Example:**

```ts
import { app } from './app';
import { z } from 'zod';

export const getUserById = app.query('jobs', {
  path: 'users.get.$userId',
  input: z.null(), // No input body needed, ID is from the path
  output: z.object({
    id: z.string(),
    name: z.string(),
  }).nullable(),
  handler: async ({ ctx, db, cache, params }) => {
    const { userId } = params;
    
    // Attempt to retrieve from cache first
    const cachedUser = await cache.get(`user:${userId}`);
    if (cachedUser) {
      return cachedUser;
    }

    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, userId),
    });

    // Store the result in the cache for future requests
    if (user) {
      await cache.set(`user:${userId}`, user, { ttl: 3600 }); // Cache for 1 hour
    }

    return user;
  },
});
```

### The `backend` Instance

The object returned by `createBackend` is not just for starting and stopping the server. It's also a fully-typed client for invoking your mutations and queries.

```ts
// main.ts, after creating the backend instance
async function runClientLogic(backend) {
  try {
    // Invoke a mutation
    const result = await backend.mutations.createUser({
      input: { name: 'Jane Doe', email: 'jane@robot.com' },
    });
    console.log('Created user:', result); // { id: '...' }

    // Invoke a query
    const user = await backend.queries.getUserById({
      params: { userId: result.id },
    });
    console.log('Fetched user:', user);

  } catch (error) {
    console.error('Client operation failed:', error);
  }
}
```

## 5. Advanced Topics

### Atomicity & The Transactional Outbox Pattern

RBF's core reliability promise is achieved through the **Transactional Outbox pattern**. This pattern ensures that messages for side-effects are only sent if the primary database transaction succeeds.

Here is the lifecycle of a mutation with a scheduled task:

1.  A `SERIALIZABLE` database transaction is started.
2.  The queue's middleware runs inside this transaction.
3.  The mutation's handler logic runs.
4.  When `scheduler.enqueue()` is called, it **does not** immediately publish to NATS. Instead, it inserts a record representing the message into a special `rbf_outbox` table within the same database transaction.
5.  The handler completes, and its result is saved to a `rbf_results` table, also within the transaction.
6.  The database transaction is committed. At this point, the changes to your business tables, the outbox message, and the result are all atomically and durably saved.
7.  **After the commit succeeds**, a background process in RBF:
    a. Reads the message from the `rbf_outbox` table.
    b. Publishes it to the NATS stream.
    c. Upon receiving confirmation from NATS, it deletes the message from the `rbf_outbox` table.

**Failure Recovery:**
*   If the application crashes after step 6 but before 7c, the message remains in the `rbf_outbox` table. A background "sweeper" process will periodically scan this table for orphaned messages and republish them, guaranteeing at-least-once delivery.

### Idempotency and Deduplication

To prevent processing the same message twice, RBF employs several layers of protection:

1.  **Unique Message ID:** Every request initiated by an RBF client (or a compliant external client) includes a unique request ID (e.g., a UUID) in the NATS message headers.
2.  **Result Caching:** Before starting a transaction for an incoming mutation message, RBF checks the `rbf_results` table for an existing entry matching the request ID.
3.  **Immediate Reply:** If a result is found, it means the mutation has already been successfully processed. The framework skips execution entirely and immediately returns the stored result.

This ensures that even if NATS delivers a message multiple times due to network issues or retries, the mutation's logic will only execute once.

### Middleware

Middleware provides a powerful way to run cross-cutting logic for all operations on a specific queue. It's ideal for:

*   **Authentication & Authorization:** Validating a user token from message headers and attaching the user object to the context.
*   **Logging:** Creating a request-specific logger.
*   **Distributed Tracing:** Initializing a trace span and adding it to the context.

Since middleware runs inside the same transaction as the handler, any database reads it performs are consistent with the handler's view of the data.

### Caching Queries

The `cache` object passed to query handlers provides a simple interface for caching strategies. The default implementation could be an in-memory cache, but it can be configured to use an external service like Redis for a distributed cache.

```ts
// Example cache object API
interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: { ttl: number }): Promise<void>;
  invalidate(key: string): Promise<void>;
}
```

### Interacting with NATS Directly

While using the RBF client is the easiest way to interact with your backend, any NATS-compatible client can send messages. To do so, you must adhere to the following contract:

*   **Subject:** The NATS subject is a combination of the queue name and the operation path. For a mutation with `queueName: 'jobs'` and `path: 'users.create'`, the subject would be `jobs.users.create`. For a path with params like `'posts.update.$postId'`, a concrete subject would be `jobs.posts.update.123`.
*   **Headers:**
    *   `RBF-Request-Id`: A unique identifier for this specific request (e.g., a UUID). This is crucial for idempotency.
    *   `Content-Type`: Must be `application/json`.
*   **Reply-To:** If you expect a response (as is typical for queries and mutations), you must set the NATS `reply-to` field to a subject the client is subscribed to. RBF will publish the result or error to this subject.
*   **Payload:** The body of the message should be the JSON-stringified input object.

## 6. Full Example: User Signup Flow

`app.ts`:
```ts
// ... (defineBackend and context setup as before)
```

`mutations.ts`:
```ts
import { app, JobsContext } from './app';
import { z } from 'zod';
import { users } from './db/schema';

// This mutation will be defined but used as a reference
// It would have its own handler to connect to an email service.
export const sendWelcomeEmail = app.mutation('events', {
  path: 'email.sendWelcome',
  input: z.object({ userId: z.string() }),
  handler: async ({ input }) => {
    console.log(`Simulating sending a welcome email to user ${input.userId}`);
    // ... logic to call an email API
    return { success: true };
  },
});

export const createUser = app.mutation('jobs', {
  path: 'users.create',
  input: z.object({
    email: z.string().email(),
    name: z.string().min(2),
  }),
  output: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  handler: async ({ ctx, db, scheduler, input }) => {
    // The middleware on the 'jobs' queue already ran, so ctx.user exists.
    ctx.logger.info(`User ${ctx.user.name} is creating a new user: ${input.name}`);

    // Check for existing user
    const existing = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, input.email),
    });

    if (existing) {
      throw new Error('User with this email already exists.');
    }

    const [newUser] = await db
      .insert(users)
      .values({ name: input.name, email: input.email })
      .returning();

    // Atomically schedule the welcome email.
    // This message will only be sent to the 'events' queue if the above
    // database insert commits successfully.
    scheduler.enqueue(sendWelcomeEmail, {
      input: { userId: newUser.id },
    });

    return newUser;
  },
});
```