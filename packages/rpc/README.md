# RPC

RPC framework powered by [NATS.IO](https://nats.io).

## Features

- Fully type safe
- Very modular
- Procedures declaration and implementation are separated (can even be on different packages or repos)
- Prepared for microservices and distributed systems
- Error handling and retry on failure (nats work queues)
- Scalable type inference performance

**WARNING**: This is still not fully tested and does probably contain many bugs

## Usage

Define procedures

```ts
import { defineProcedure } from "@robot.com/rpc/client";

const api = {
  demo: defineProcedure({
    path: "demo.$id",
    method: "GET",
    outputSchema: z.object({ name: z.string() }),
    paramsSchema: z.object({ id: z.string() }),
  }),
  test: defineProcedure({
    path: "test.$id",
    method: "POST",
    inputSchema: z.null(),
    outputSchema: z.object({ success: z.boolean() }),
    paramsSchema: z.object({ id: z.string() }),
  }),
};
```

This allows to define procedures shape, structures and types independently from its implementation and server code.

Implement procedure:

```ts
import { Registry, startRpcNatsServer } from "@robot.com/rpc/server";
import { connect } from "@nats-io/transport-node";
import { jetstream } from "@nats-io/jetstream";

const registry = new Registry({
  initialContext: null,
  middleware: async (_, req) => {
    // context info
    return {
      req,
    };
  },
});

registry.impl(api.demo, async () => {
  return {
    data: { name: "test" },
  };
});

// Create NATS client
const ncsrv = await connect({
  servers: [process.env.NATS_URL!],
  token: process.env.NATS_TOKEN,
});

// Setup NATS for using the rpc
const js = jetstream(ncsrv);
const man = await js.jetstreamManager();

// Create stream to capture requests
await man.streams.add({
  name: "engine_test_requests",
  subjects: ["engine_test.requests.>"],
  retention: "workqueue",
});
// Create consumer for the stream
await man.consumers.add("engine_test_requests", {
  name: "handler",
  durable_name: "handler",
  ack_policy: "explicit",
});

const server = await startRpcNatsServer({
  nats: ncsrv,
  streamName: "engine_test_requests",
  consumerName: "handler",
  subjectPrefix: "engine_test.requests.",
  registry,
});

// STOP SERVER
await server.stop();
// DRAIN CLIENT
await ncsrv.drain();
```

Call procedure:

```ts
import { connect } from "@nats-io/transport-node";

const ncclient = await connect({
  servers: [process.env.NATS_URL!],
  token: process.env.NATS_TOKEN,
});

const client = new RPCClientNATS({
  nats: ncclient,
  publishPrefix: "engine_test.requests.",
  headers: {
    Authorization: "DemoAuthHeader",
  },
});

const res = await client.call(api.demo, {
  params: { id: "123" },
  input: { filter: "test" },
});

assert.equal(res.name, "John Doe");
```
