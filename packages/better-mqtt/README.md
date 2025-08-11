# better-mqtt

This is a better MQTT client for modern applications. It is a wrapper for [`mqtt`](https://www.npmjs.com/package/mqtt) lib client. It provides a more convenient api for working with MQTT.

## Features

- Handle subscriptions and messages independently from each other
- Handle JSON payloads more easily
- Parse topic params
- Straightforward api
- Based on already proven [`mqtt`](https://www.npmjs.com/package/mqtt) library

## Usage

### Basic Subscribe

```ts
import { BetterMQTT } from "@robot.com/better-mqtt";

export const connectOptions = {
  host: process.env.MQTT_HOST!,
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASS,
  protocolVersion: 5,
  protocol: "mqtts",
  port: 8883,
  clean: true,
} as const;

const mqtt = await BetterMQTT.connectAsync(connectOptions);

assert.strictEqual(mqtt.status, "online");

const sub = mqtt.subscribeString("test/better-mqtt/subscribe_1");

mqtt.publish("test/better-mqtt/subscribe_1", "test message");

for await (const message of sub) {
  assert.strictEqual(message.content, "test message");
  break;
}
```

### Subscribe with Callback

```ts
import { BetterMQTT } from "@robot.com/better-mqtt";

const mqtt = BetterMQTT.connect(connectOptions);

const sub = mqtt.subscribeString("test/better-mqtt/subscribe_1");

sub.on("message", (message) => {
  assert.strictEqual(message.content, "test message");
});

mqtt.publish("test/better-mqtt/subscribe_1", "test message");
```

### From existing client

```ts
import { connect } from "mqtt";

const client = connect("mqtt://broker.hivemq.com");

const mqtt = new BetterMQTT(client);
```

### Subscribe Async

```ts
import { BetterMQTT } from "@robot.com/better-mqtt";

const mqtt = await BetterMQTT.connectAsync(connectOptions);

assert.strictEqual(mqtt.status, "online");

const sub = await mqtt.subscribeStringAsync("test/better-mqtt/subscribe_2");
```

### JSON

```ts
const sub = mqtt.subscribeJson("test/better-mqtt/json_1");

mqtt.publishJson("test/better-mqtt/json_1", { message: "test message" });

for await (const message of sub) {
  assert.deepEqual(message.content, { message: "test message" });
  break;
}
```

### Wildcard Params

```ts
const mqtt = await BetterMQTT.connectAsync(connectOptions);

const sub = mqtt.subscribeString("test/better-mqtt/wildcard_1/+");

mqtt.publish("test/better-mqtt/wildcard_1_wrong/not-match/1", "wrong");
mqtt.publish("test/better-mqtt/wildcard_1/1/wrong", "wrong");
mqtt.publish("test/better-mqtt/wildcard_1/1", "test message");

for await (const message of sub) {
  assert.strictEqual(message.content, "test message");
  assert.deepStrictEqual(message.params, ["1"]);
  assert.strictEqual(message.topic, "test/better-mqtt/wildcard_1/1");
  break;
}

mqtt.end();
```
