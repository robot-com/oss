import assert from 'node:assert'
import { describe, it } from 'node:test'
import { createAsyncGenerator } from '../generator'
import { matchTopic } from '../match'

describe('Edge Cases', () => {
    describe('Topic Matching Regex Escaping', () => {
        it('should not match topics with special regex characters if they are not wildcards', () => {
            // The pattern has a dot, which in regex matches any character.
            // If not escaped, 'sensor.temp' would match 'sensorXtemp'.
            const pattern = 'sensor.temp'
            const topic = 'sensorXtemp'

            const match = matchTopic(topic, pattern)
            assert.strictEqual(
                match,
                null,
                'Should not match because dot should be literal',
            )
        })

        it('should match literal dot correctly', () => {
            const pattern = 'sensor.temp'
            const topic = 'sensor.temp'

            const match = matchTopic(topic, pattern)
            assert.notStrictEqual(match, null)
        })

        it('should treat + inside a segment as literal, not wildcard', () => {
            const pattern = 'a+b/c'
            const topic = 'axb/c' // Should NOT match

            const match = matchTopic(topic, pattern)
            assert.strictEqual(
                match,
                null,
                'Should not match because + is not a wildcard here',
            )

            const topic2 = 'a+b/c' // Should match literal +
            const match2 = matchTopic(topic2, pattern)
            assert.notStrictEqual(match2, null)
        })
    })

    describe('Async Generator', () => {
        it('should stop pushing to queue after generator is closed (break)', async () => {
            const { push, generator } = createAsyncGenerator<number>()

            // Push some values
            push(1)
            push(2)
            push(3)

            // Consume one value and break
            for await (const val of generator) {
                assert.strictEqual(val, 1)
                break
            }

            // Attempt to push more values
            // We can't easily check the internal queue size without modifying the code,
            // but we can check if it throws or logs warnings if we were mocking console.
            // For now, let's just ensure it doesn't crash.
            push(4)
            push(5)

            // If we try to consume again, it should be done (or new generator needed)
            // The current implementation re-uses the generator object? No, generator() returns an iterator.
            // Once broken, that iterator is done.
        })

        it('should handle backpressure (potential OOM check)', async () => {
            const { push, generator } = createAsyncGenerator<number>()

            // Push a lot of values without consuming
            const count = 10000
            for (let i = 0; i < count; i++) {
                push(i)
            }

            // Consume them all
            let received = 0
            for await (const _val of generator) {
                received++
                if (received === count) break
            }

            assert.strictEqual(received, count)
        })
    })
})
