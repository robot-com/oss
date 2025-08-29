/** biome-ignore-all lint/suspicious/noExplicitAny: Required for type inference */
import type { MutationDefinition, QueryDefinition } from '../types'

/** A generic type representing any mutation definition. */
type GenericMutation = MutationDefinition<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any
>
/** A generic type representing any query definition. */
type GenericQuery = QueryDefinition<any, any, any, any, any, any, any, any, any>

/**
 * Represents a node in the routing tree.
 */
interface Node {
    /** Static child nodes, keyed by the path segment. */
    children: Map<string, Node>
    /** A dynamic child node for parameter matching (e.g., $id). */
    paramChild: Node | null
    /** The name of the parameter if `paramChild` exists (e.g., 'id'). */
    paramName: string | null
    /** The query definition if this node represents a complete query path. */
    query: GenericQuery | null
    /** The mutation definition if this node represents a complete mutation path. */
    mutation: GenericMutation | null
}

/**
 * A registry for API queries and mutations that uses a tree-based routing
 * structure for efficient path matching.
 * Paths are dot-separated strings, where segments starting with '$' are
 * treated as dynamic parameters.
 *
 * @example
 * const registry = new Registry();
 * registry.addQuery({ path: 'api.users.get.$id', ... });
 * const match = registry.match('api.users.get.123');
 * // match will be { params: ['123'], query: { ... } }
 */
export class Registry {
    /** The root node of the routing tree. */
    private root: Node = this.createNode()

    /**
     * Creates and initializes a new Node.
     * @returns An empty Node object.
     */
    private createNode(): Node {
        return {
            children: new Map(),
            paramChild: null,
            paramName: null,
            query: null,
            mutation: null,
        }
    }

    /**
     * Adds a query or mutation definition to the registry tree.
     * @param path The dot-separated path for the definition.
     * @param definition An object containing either a 'query' or 'mutation'.
     * @throws {Error} if a definition already exists for the path.
     * @throws {Error} if conflicting parameter names are used at the same level.
     */
    private add(
        path: string,
        definition: { query: GenericQuery } | { mutation: GenericMutation },
    ) {
        const segments = path.split('.')
        let currentNode = this.root

        for (const segment of segments) {
            if (segment.startsWith('$')) {
                const paramName = segment.slice(1)
                if (!currentNode.paramChild) {
                    currentNode.paramChild = this.createNode()
                    currentNode.paramName = paramName
                } else if (currentNode.paramName !== paramName) {
                    throw new Error(
                        `Conflicting parameter names at the same level: '${currentNode.paramName}' and '${paramName}' for path '${path}'`,
                    )
                }
                currentNode = currentNode.paramChild
            } else {
                let childNode = currentNode.children.get(segment)
                if (!childNode) {
                    childNode = this.createNode()
                    currentNode.children.set(segment, childNode)
                }
                currentNode = childNode
            }
        }

        if (currentNode.query || currentNode.mutation) {
            throw new Error(`A definition already exists for path: ${path}`)
        }

        if ('query' in definition) {
            currentNode.query = definition.query
        } else {
            currentNode.mutation = definition.mutation
        }
    }

    /**
     * Registers a query definition in the registry.
     * @param query The query definition to add.
     * @returns The added query definition.
     */
    addQuery<
        T extends QueryDefinition<any, any, any, any, any, any, any, any, any>,
    >(query: T): T {
        this.add(query.path, { query })
        return query
    }

    /**
     * Registers a mutation definition in the registry.
     * @param mutation The mutation definition to add.
     * @returns The added mutation definition.
     */
    addMutation<
        T extends MutationDefinition<
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any,
            any
        >,
    >(mutation: T): T {
        this.add(mutation.path, { mutation })
        return mutation
    }

    /**
     * Finds a matching query or mutation for a given path.
     * It traverses the tree, prioritizing static segments over dynamic parameters.
     * @param path The dot-separated path to match.
     * @returns An object containing the matched definition and any captured
     *          parameter values, or null if no match is found.
     */
    match(
        path: string,
    ):
        | ({ params: string[] } & (
              | { mutation: GenericMutation }
              | { query: GenericQuery }
          ))
        | null {
        const segments = path.split('.')
        const params: string[] = []
        let currentNode = this.root

        for (const segment of segments) {
            // Prioritize static match
            const staticChild = currentNode.children.get(segment)
            if (staticChild) {
                currentNode = staticChild
                continue
            }

            // Fallback to parameter match
            if (currentNode.paramChild) {
                params.push(segment)
                currentNode = currentNode.paramChild
                continue
            }

            // No match found for this segment
            return null
        }

        if (currentNode.query) {
            return { params, query: currentNode.query }
        }

        if (currentNode.mutation) {
            return { params, mutation: currentNode.mutation }
        }

        // Path is a prefix of a registered path, but not a complete match
        return null
    }
}
