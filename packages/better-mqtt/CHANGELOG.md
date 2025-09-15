# Changelog

## 0.1.0

- Initial release

## 0.1.1

- Added keywords
- Added changelog

## 0.1.2

- Updated README.md

## 0.1.3

- Fix peer dependencies: allow react 18 or 19

## 0.1.4

- Fix import of mqtt to improve compatibility (now works in nextjs)

## 0.1.5

- Fix `connect()` params options. Now it can receive a `brokerUrl` as the first argument.
  (The same as the `mqtt.connect()` function)

## 0.2.0

**BREAKING CHANGE**: `BetterMQTTProvider` now doesn't create the MQTT client internally. You must pass an instance of `BetterMQTT` as a prop.

## 0.2.1

- Added new `mock` module to create mock MQTT clients for testing purposes.
- Added support for optional `enabled` flag in `useMQTTSubscription` hook.
