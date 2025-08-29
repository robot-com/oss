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
    *   [Middleware](#middleware)
    *   [The Scheduler](#the-scheduler)
3.  [Getting Started](#3-getting-started)
    *   [Installation](#installation)
    *   [Defining the Backend](#defining-the-backend)
    *   [Creating and Running the Backend Instance](#creating-and-running-the-backend-instance)
4.  [API Reference](#4-api-reference)
    *   [`defineBackend<Context, Schema>`](#definebackendcontext-schema)
    *   [`app.middleware(handler)`](#appmiddlewarehandler)
    *   [`app.mutation(queueName, definition)`](#appmutationqueuename-definition)
    *   [`app.query(queueName, definition)`](#appqueryqueuename-definition)
    *   [The `backend` Instance](#the-backend-instance)
5.  [Advanced Topics](#5-advanced-topics)
    *   [Atomicity & The Transactional Outbox Pattern](#atomicity--the-transactional-outbox-pattern)
    *   [Idempotency and Deduplication](#idempotency-and-deduplication)
    *   [Interacting with NATS Directly](#interacting-with-nats-directly)
6.  [Roadmap & Future Directions](#6-roadmap--future-directions)
7.  [Full Example: User Signup Flow](#7-full-example-user-signup-flow)

---

## 1. Introduction

### What is RBF?

The Reliable Backend Framework (RBF) is a TypeScript framework for building robust, scalable, and fault-tolerant server-side applications. It is designed around a core set of primitives (**Mutations**, **Queries**, **Queues**, and **Middleware**) that ensure data consistency and operational reliability, even in distributed environments.

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
*   **Cacheable:** Queries are designed to be cacheable to improve performance, a feature planned for a future release.

### Queues

Queues are the backbone of RBF's communication and workload management. They are logical channels, backed by NATS streams, where messages are sent to trigger Mutations or Queries.

You define queues when you initialize your application. Each queue can have its own configuration, such as middleware for authentication or logging.

### Middleware

Middleware provides a powerful way to run cross-cutting logic before your mutation or query handlers. It allows you to create a pipeline of functions that can inspect requests and augment the `context` object available to subsequent middleware and the final handler.

This is ideal for concerns like authentication, logging, or establishing database connections. Middleware runs inside the same transaction as the handler, ensuring any database reads it performs are consistent with the handler's view of the data.

### The Scheduler

The `scheduler` is a special object available only within Mutation handlers. It is the interface for defining the side-effects of a mutation. It allows you to schedule follow-up tasks to run immediately after the transaction commits (`enqueue`), at a specific time (`runAt`), after a delay (`runAfter`), or to publish a raw NATS message for maximum flexibility (`publish`).

This is the key to building complex, multi-step workflows that are fully atomic and reliable.

## 3. Getting Started

### Installation

```bash
npm install @robot.com/reliable-backend-framework zod drizzle-orm postgres nats
```

### Defining the Backend

The first step is to define the structure of your application using `defineBackend`. This function types your application, declares its queues, and allows you to build a middleware pipeline.

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

// 3. Define the base backend application
const baseApp = defineBackend<AppContext, AppSchema>({
  queues: {
    // A queue for handling general jobs
    jobs: {},
    // A queue for domain events
    events: {},
  },
});

// 4. (Optional) Chain middleware to create new, context-aware app definitions
// This middleware authenticates a user and adds them to the context.
export const app = baseApp.middleware(async ({ ctx, db, msg }) => {
  // In a real app, you would decode a token from `msg.headers`
  const user = { id: 'user_123', name: 'Jane Doe' };
  return {
    ctx: {
      ...ctx,
      user,
    },
  };
});

// Now, any mutation or query defined with `app` will have `user` in its context.
// Mutations defined with `baseApp` will not.
```

### Creating and Running the Backend Instance

Once the app is defined, you create a runnable instance with `createBackend`. This is where you connect your abstract definition to concrete implementations like a database connection and NATS clients.

`main.ts`:
```ts
import { createBackend } from 'rbf-framework';
import { app, AppContext } from './app';
import { connect as connectToNats } from 'nats';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './db/schema';

async function main() {
  // 1. Establish connections to external services
  const natsConnection = await connectToNats({ servers: 'nats://localhost:4222' });
  const connectionString = 'postgres://user:pass@host:port/db';
  const pgClient = postgres(connectionString);
  const db = drizzle(pgClient, { schema });

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
*   **`options.queues`**: An object where keys are the names of the queues your application will use. The values are currently empty objects, reserved for future configuration.
*   **`options.context`**: An optional object that serves as the base context for all operations.
*   **`options.middleware`**: An optional initial middleware function to run for all operations.

### `app.middleware(handler)`

Chains a new middleware to an existing app definition, returning a *new* app definition with an augmented context type.

*   **`handler`**: An async function that receives the current context (`ctx`), the database transaction (`db`), and the raw NATS message (`msg`). It must return an object with a `ctx` property containing the new, augmented context.

**Example:**

```ts
// baseApp has a context of type { logger: ... }
const baseApp = defineBackend({
  context: { logger },
  queues: { jobs: {} },
});

// appWithOrg has a context of type { logger: ..., org: { id: string } }
const appWithOrg = baseApp.middleware(async ({ ctx }) => {
  return {
    ctx: {
      ...ctx,
      org: { id: 'org_123' },
    },
  };
});

// appWithUser has a context of type { logger: ..., org: ..., user: ... }
const appWithUser = appWithOrg.middleware(async ({ ctx }) => {
  return {
    ctx: {
      ...ctx,
      user: { id: 'user_456' },
    },
  };
});
```

### `app.mutation(queueName, definition)`

Defines a mutation and registers it with the application.

*   **`queueName`**: The name of the queue this mutation will listen on. Must be a key in the `queues` object of the app definition.
*   **`definition`**: An object with the following properties:
    *   `path`: A string defining the "address" of the mutation. It follows a dot-notation convention and can include dynamic parameters prefixed with `$`, like `'users.create'` or `'posts.update.$postId'`. These parameters are automatically parsed and passed to the handler.
    *   `input`: An optional Zod schema for validating the incoming message payload. Defaults to `z.null()`.
    *   `output`: An optional Zod schema for validating the return value of the handler.
    *   `handler`: The async function containing the business logic. It receives a single object argument with the following properties:
        *   `ctx`: The shared application context. Its type is determined by the initial context and any chained middleware.
        *   `db`: The Drizzle `PgTransaction` instance for this operation.
        *   `scheduler`: An object with methods to manage side-effects and control flow:
            *   `enqueue`: Schedules a task to run immediately after the current transaction commits.
            *   `runAt`: Schedules a task to run at a specific `Date`.
            *   `runAfter`: Schedules a task to run after a specified delay (e.g., `{ seconds: 30 }`).
            *   `publish`: Publishes a raw message to a NATS subject, bypassing the RBF task format. Useful for integrating with other systems.
            *   `setRetryDelay`: If the current transaction fails and the message is NACK'd, this method suggests a delay before NATS should redeliver it. This allows for custom backoff strategies.
        *   `input`: The validated input payload.
        *   `params`: An object containing the parsed parameters from the `path`.

**Example:**

```ts
import { app } from './app'; // Assuming `app` is the definition with auth middleware
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
    // `ctx.user` is available and typed here because of the middleware
    ctx.logger.info(`Creating user ${input.name} by ${ctx.user.name}`);

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
    *   `ctx`: The context, augmented by any middleware.
    *   `db`: The read-only `PgTransaction` instance.
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
  output: z
    .object({
      id: z.string(),
      name: z.string(),
    })
    .nullable(),
  handler: async ({ ctx, db, params }) => {
    const { userId } = params;

    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, userId),
    });

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
2.  The mutation's handler logic runs.
3.  When `scheduler.enqueue()` is called, it **does not** immediately publish to NATS. Instead, it inserts a record representing the message into a special `rbf_outbox` table within the same database transaction.
4.  The handler completes, and its result is saved to a `rbf_results` table, also within the transaction.
5.  The database transaction is committed. At this point, the changes to your business tables, the outbox message, and the result are all atomically and durably saved.
6.  **After the commit succeeds**, a background process in RBF:
    a. Reads the message from the `rbf_outbox` table.
    b. Publishes it to the NATS stream.
    c. Upon receiving confirmation from NATS, it deletes the message from the `rbf_outbox` table.

**Failure Recovery:**
*   If the application crashes after step 5 but before 6c, the message remains in the `rbf_outbox` table. A background "sweeper" process will periodically scan this table for orphaned messages and republish them, guaranteeing at-least-once delivery.

### Idempotency and Deduplication

To prevent processing the same message twice, RBF employs several layers of protection:

1.  **Unique Message ID:** Every request initiated by an RBF client (or a compliant external client) includes a unique request ID (e.g., a UUID) in the NATS message headers.
2.  **Result Caching:** Before starting a transaction for an incoming mutation message, RBF checks the `rbf_results` table for an existing entry matching the request ID.
3.  **Immediate Reply:** If a result is found, it means the mutation has already been successfully processed. The framework skips execution entirely and immediately returns the stored result.

This ensures that even if NATS delivers a message multiple times due to network issues or retries, the mutation's logic will only execute once.

### Interacting with NATS Directly

While using the RBF client is the easiest way to interact with your backend, any NATS-compatible client can send messages. To do so, you must adhere to the following contract:

*   **Subject:** The NATS subject is a combination of the queue name and the operation path. For a mutation with `queueName: 'jobs'` and `path: 'users.create'`, the subject would be `jobs.users.create`. For a path with params like `'posts.update.$postId'`, a concrete subject would be `jobs.posts.update.123`.
*   **Headers:**
    *   `RBF-Request-Id`: A unique identifier for this specific request (e.g., a UUID). This is crucial for idempotency.
    *   `Content-Type`: Optional. If not provided, the payload is assumed to be `application/json`.
*   **Reply-To:** If you expect a response (as is typical for queries and mutations), you must set the NATS `reply-to` field to a subject the client is subscribed to. RBF will publish the result or error to this subject.
*   **Payload:** The body of the message should be the JSON-stringified input object.

## 6. Roadmap & Future Directions

RBF 1.0.0 provides a solid foundation for building reliable applications. Our vision is to continue enhancing the framework's capabilities, focusing on production readiness, operational observability, and an improved developer experience. The following is a list of features and improvements planned for future releases.

### Core Functionality & Reliability

*   **Advanced Error Handling & Retries:**
    *   **Configurable Retry Policies:** Introduce declarative, per-queue or per-mutation configuration for retry strategies, including exponential backoff, fixed intervals, and maximum attempt limits.
    *   **Dead-Letter Queues (DLQ):** Automatically forward messages that have exhausted their retries to a configurable Dead-Letter Queue for manual inspection and replay.
    *   **Retryable vs. Permanent Errors:** Provide a mechanism within the handler for developers to signal whether a thrown error is temporary (and should be retried) or permanent (and should be sent to the DLQ immediately).

*   **Database Schema Management:**
    *   **Automated Migrations:** Provide a CLI command (e.g., `rbf db:init`) to generate the initial SQL migration for creating the required `rbf_outbox` and `rbf_results` tables.

*   **Schema Versioning:**
    *   **Input Schema Evolution:** Establish best practices and provide tooling for versioning mutation and query schemas to ensure backward compatibility and safe deployments when message contracts change.

### Production & Operational Concerns

*   **First-Class Observability:**
    *   **Structured Logging:** Emit detailed, structured logs from the framework core to provide insight into the lifecycle of every message.
    *   **Metrics:** Natively export key performance indicators in a standard format like Prometheus, including queue depth, message processing latency, error rates per-mutation, and transaction duration.
    *   **Distributed Tracing:** Integrate with OpenTelemetry to automatically propagate trace contexts across services, providing a complete view of a request as it flows through multiple mutations.

*   **Deployment & Scaling:**
    *   **Dedicated Workers:** Provide clear patterns and configuration options for deploying dedicated worker pools that subscribe to specific high-volume queues.
    *   **Zero-Downtime Deployment:** Document best practices for performing zero-downtime deployments, ensuring that in-flight messages are processed correctly during a version upgrade.

### Developer Experience & Advanced Patterns

*   **Enhanced Middleware System:**
    *   A basic middleware system has been implemented for augmenting context. Future enhancements include:
        *   **Error Handling:** Introduce dedicated error handling within middleware.
        *   **Lifecycle Hooks:** Provide hooks that can run after a handler has completed (e.g., for logging results or cleaning up resources).
        *   **Richer Middleware Input:** Expose more request metadata to the middleware handler.

*   **Dedicated Testing Library:**
    *   Release a `@robot.com/rbf-testing` package with utilities to simplify testing, including a mock `scheduler` for asserting on enqueued tasks, an in-memory queue implementation, and helpers for constructing test contexts.

*   **Recurring & Cron Jobs:**
    *   Introduce a new primitive, `app.cron()`, for defining recurring tasks on a schedule (e.g., `'0 2 * * *'` for 2 AM daily), integrating seamlessly with the existing reliability guarantees.

*   **Task Cancellation:**
    *   Implement a mechanism to cancel scheduled tasks that have not yet executed. The `scheduler.runAt` and `runAfter` methods would return a unique job ID that can be used for cancellation.

*   **RBF Command-Line Interface (CLI):**
    *   Develop a CLI tool for interacting with a running RBF application. Planned commands include:
        *   `rbf queue:list`: List all defined queues.
        *   `rbf queue:inspect <queueName>`: View messages in a queue or its associated DLQ.
        *   `rbf job:trigger <path> [input]`: Manually trigger a mutation or query from the command line.
        *   `rbf job:replay <messageId>`: Replay a specific message from the DLQ.

*   **Improved Documentation:**
    *   Add architectural and sequence diagrams to visually explain core concepts like the transactional outbox pattern and the full lifecycle of a request.

*   **Client-Side Timeouts:**
    *   Allow the RBF client to specify a timeout when invoking a mutation or query, preventing the `await` from hanging indefinitely if the system is under heavy load.

## 7. Full Example: User Signup Flow

`app.ts`:
```ts
// ... (defineBackend and context setup as before)
```

`mutations.ts`:
```ts
import { app, AppContext } from './app';
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
    ctx.logger.info(`Creating a new user: ${input.name}`);

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