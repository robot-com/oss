/** biome-ignore-all lint/suspicious/noExplicitAny: Needed for testing */
import assert from 'node:assert/strict'
import test from 'node:test'
import { Registry } from '../server/registry'

// Mock definitions for testing purposes.
// The actual implementation details of the definitions don't matter for the registry tests.
const createMockQuery = (path: string) => ({ path, type: 'query' }) as any
const createMockMutation = (path: string) => ({ path, type: 'mutation' }) as any

test('Registry: Basic Operations', async (t) => {
    await t.test('should add and match a simple query', () => {
        const registry = new Registry()
        const queryDef = createMockQuery('api.users.list')
        registry.addQuery(queryDef)

        const match = registry.match('api.users.list')
        assert.notEqual(match, null)
        assert.deepStrictEqual(match?.params, {})
        assert.strictEqual(match?.definition, queryDef)
        assert.strictEqual(match?.type, 'query')
    })

    await t.test('should add and match a simple mutation', () => {
        const registry = new Registry()
        const mutationDef = createMockMutation('api.users.create')
        registry.addMutation(mutationDef)

        const match = registry.match('api.users.create')
        assert.notEqual(match, null)
        assert.deepStrictEqual(match?.params, {})
        assert.strictEqual(match?.definition, mutationDef)
        assert.strictEqual(match?.type, 'mutation')
    })

    await t.test('should return null for a non-existent path', () => {
        const registry = new Registry()
        registry.addQuery(createMockQuery('api.users.list'))
        const match = registry.match('api.users.get')
        assert.strictEqual(match, null)
    })

    await t.test(
        'should return null for a path that is a prefix of a registered path',
        () => {
            const registry = new Registry()
            registry.addQuery(createMockQuery('api.users.list'))
            const match = registry.match('api.users')
            assert.strictEqual(match, null)
        },
    )

    await t.test(
        'should not match a path that is longer than any registered path',
        () => {
            const registry = new Registry()
            registry.addQuery(createMockQuery('api.users'))
            const match = registry.match('api.users.list')
            assert.strictEqual(match, null)
        },
    )

    await t.test('should return the added definition object', () => {
        const registry = new Registry()
        const queryDef = createMockQuery('api.test.query')
        const mutationDef = createMockMutation('api.test.mutation')

        const returnedQuery = registry.addQuery(queryDef)
        const returnedMutation = registry.addMutation(mutationDef)

        assert.strictEqual(returnedQuery, queryDef)
        assert.strictEqual(returnedMutation, mutationDef)
    })
})

test('Registry: Parameter Matching', async (t) => {
    await t.test('should match a path with a single parameter', () => {
        const registry = new Registry()
        const queryDef = createMockQuery('users.get.$id')
        registry.addQuery(queryDef)

        const match = registry.match('users.get.123')
        assert.notEqual(match, null)
        assert.deepStrictEqual(match?.params, { id: '123' })
        assert.strictEqual(match?.definition, queryDef)
    })

    await t.test('should match a path with multiple parameters', () => {
        const registry = new Registry()
        const queryDef = createMockQuery('orgs.$orgId.users.$userId')
        registry.addQuery(queryDef)

        const match = registry.match('orgs.acme.users.user-456')
        assert.notEqual(match, null)
        assert.deepStrictEqual(match?.params, {
            orgId: 'acme',
            userId: 'user-456',
        })
        assert.strictEqual(match?.definition, queryDef)
    })

    await t.test(
        'should match a path with mixed static and dynamic segments',
        () => {
            const registry = new Registry()
            const queryDef = createMockQuery('posts.$postId.comments.list')
            registry.addQuery(queryDef)

            const match = registry.match('posts.post-789.comments.list')
            assert.notEqual(match, null)
            assert.deepStrictEqual(match?.params, { postId: 'post-789' })
            assert.strictEqual(match?.definition, queryDef)
        },
    )

    await t.test('should prioritize static segments over dynamic ones', () => {
        const registry = new Registry()
        const staticDef = createMockQuery('users.me')
        const dynamicDef = createMockQuery('users.$id')

        registry.addQuery(staticDef)
        registry.addQuery(dynamicDef)

        // Match the static path
        const staticMatch = registry.match('users.me')
        assert.notEqual(staticMatch, null)
        assert.strictEqual(staticMatch?.definition, staticDef)
        assert.deepStrictEqual(staticMatch?.params, {})

        // Match a dynamic path
        const dynamicMatch = registry.match('users.user-xyz')
        assert.notEqual(dynamicMatch, null)
        assert.strictEqual(dynamicMatch?.definition, dynamicDef)
        assert.deepStrictEqual(dynamicMatch?.params, { id: 'user-xyz' })
    })

    await t.test('should handle parameters at the root level', () => {
        const registry = new Registry()
        const queryDef = createMockQuery('$tenantId.users.list')
        registry.addQuery(queryDef)

        const match = registry.match('tenant-1.users.list')
        assert.notEqual(match, null)
        assert.deepStrictEqual(match?.params, { tenantId: 'tenant-1' })
        assert.strictEqual(match?.definition, queryDef)
    })
})

test('Registry: Error Handling and Conflicts', async (t) => {
    await t.test('should throw an error for duplicate query paths', () => {
        const registry = new Registry()
        const queryDef1 = createMockQuery('api.users.list')
        const queryDef2 = createMockQuery('api.users.list')
        registry.addQuery(queryDef1)

        assert.throws(
            () => registry.addQuery(queryDef2),
            new Error('A definition already exists for path: api.users.list'),
        )
    })

    await t.test('should throw an error for duplicate mutation paths', () => {
        const registry = new Registry()
        const mutationDef1 = createMockMutation('api.users.create')
        const mutationDef2 = createMockMutation('api.users.create')
        registry.addMutation(mutationDef1)

        assert.throws(
            () => registry.addMutation(mutationDef2),
            new Error('A definition already exists for path: api.users.create'),
        )
    })

    await t.test(
        'should throw an error when adding a mutation to an existing query path',
        () => {
            const registry = new Registry()
            registry.addQuery(createMockQuery('api.users.action'))

            assert.throws(
                () =>
                    registry.addMutation(
                        createMockMutation('api.users.action'),
                    ),
                new Error(
                    'A definition already exists for path: api.users.action',
                ),
            )
        },
    )

    await t.test(
        'should throw an error when adding a query to an existing mutation path',
        () => {
            const registry = new Registry()
            registry.addMutation(createMockMutation('api.users.action'))

            assert.throws(
                () => registry.addQuery(createMockQuery('api.users.action')),
                new Error(
                    'A definition already exists for path: api.users.action',
                ),
            )
        },
    )

    await t.test(
        'should throw an error for conflicting parameter names at the same level',
        () => {
            const registry = new Registry()
            registry.addQuery(createMockQuery('users.$id.profile'))

            assert.throws(
                () =>
                    registry.addQuery(
                        createMockQuery('users.$userId.settings'),
                    ),
                new Error(
                    "Conflicting parameter names at the same level: 'id' and 'userId' for path 'users.$userId.settings'",
                ),
            )
        },
    )

    await t.test(
        'should not throw for same parameter name at the same level',
        () => {
            const registry = new Registry()
            registry.addQuery(createMockQuery('users.$id.profile'))

            assert.doesNotThrow(() => {
                registry.addQuery(createMockQuery('users.$id.settings'))
            })

            const match = registry.match('users.123.settings')
            assert.notEqual(match, null)
            assert.deepStrictEqual(match?.params, { id: '123' })
        },
    )
})
