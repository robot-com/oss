/** biome-ignore-all lint/suspicious/noExplicitAny: Required for type inference */
import type { MutationDefinition, QueryDefinition } from '../types'

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
type GenericQuery = QueryDefinition<any, any, any, any, any, any, any, any, any>

export class Registry {
    addQuery<
        T extends QueryDefinition<any, any, any, any, any, any, any, any, any>,
    >(query: T): T {
        // TODO: ...
        return query
    }

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
        // TODO: ...
        return mutation
    }

    match(
        path: string,
    ):
        | ({ params: string[] } & (
              | { mutation: GenericMutation }
              | { query: GenericQuery }
          ))
        | null {
        // TODO: ...
        return null
    }
}
