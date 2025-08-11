// lib.test.ts

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matchTopic } from '../match'

test("should extract a single parameter from a '+' wildcard", () => {
    const topic = 'system/events/ev123'
    const pattern = 'system/events/+'
    const match = matchTopic(topic, pattern)
    assert.deepStrictEqual(match?.params, ['ev123'])
})

test("should extract multiple parameters from multiple '+' wildcards", () => {
    const topic = 'system/test1/abcd'
    const pattern = 'system/+/+'
    const match = matchTopic(topic, pattern)
    assert.deepStrictEqual(match?.params, ['test1', 'abcd'])
})

test("should extract a multi-level parameter from a '#' wildcard", () => {
    const topic = 'system/actions/save/doc'
    const pattern = 'system/actions/#'
    const match = matchTopic(topic, pattern)
    assert.deepStrictEqual(match?.params, ['save/doc'])
})

test("should handle '#' wildcard at the root", () => {
    const topic = 'any/topic/whatsoever'
    const pattern = '#'
    const match = matchTopic(topic, pattern)
    assert.deepStrictEqual(match?.params, ['any/topic/whatsoever'])
})

test("should handle '#' matching zero levels", () => {
    const topic = 'sensors/temp/'
    const pattern = 'sensors/temp/#'
    const match = matchTopic(topic, pattern)
    assert.deepStrictEqual(match?.params, [''])
})

test('should correctly extract params with a $share subscription', () => {
    const topic = 'system/events/123'
    const pattern = '$share/group1/system/events/+'
    const match = matchTopic(topic, pattern)
    assert.deepStrictEqual(match?.params, ['123'])
})

test('should correctly extract params with a $queue subscription', () => {
    const topic = 'system/events/456'
    const pattern = '$queue/system/events/+'
    const match = matchTopic(topic, pattern)
    assert.deepStrictEqual(match?.params, ['456'])
})

test('should return null for a non-matching topic', () => {
    const topic = 'system/events/ev123'
    const pattern = 'system/alerts/+'
    const match = matchTopic(topic, pattern)
    assert.strictEqual(match?.params, undefined)
})

test('should return null for mismatched level counts', () => {
    const topic = 'a/b'
    const pattern = 'a/+/c'
    const match = matchTopic(topic, pattern)
    assert.strictEqual(match?.params, undefined)
})

test('should return an empty array for an exact match with no wildcards', () => {
    const topic = 'a/b/c'
    const pattern = 'a/b/c'
    const match = matchTopic(topic, pattern)
    assert.deepStrictEqual(match?.params, [])
})

test("should return null for an invalid pattern where '#' is not at the end", () => {
    const topic = 'system/foo/errors'
    const pattern = 'system/#/errors'
    const match = matchTopic(topic, pattern)
    assert.strictEqual(match?.params, undefined)
})

test('should return null for empty or invalid inputs', () => {
    assert.strictEqual(matchTopic('', ''), null)
    assert.strictEqual(matchTopic('a/b', ''), null)
    assert.strictEqual(matchTopic('', 'a/b'), null)
})
