(pasted text README.md)

Help me write `AppDefinition` type.
It must receive as type params:
- context (provided context, typed, usable in queries and mutations)
- schema, (dirzzle-orm tables). The Databse type is PostgresJsDatabase<SchemaType>
- queues are must be type safe, because they have middleware, and middleware must be typed.
mutations and queries reference queues by name, that must infer the modified context from the queue.
The app also has the `mutation` and `query` methods, that must be typed.
The `mutation` method must return a `MutationDefinition` type, that must be typed.
The `query` method must return a `QueryDefinition` type, that must be typed.
The `mutation` and `query` methods must be typed.
The `mutation` and `query` methods must be typed.
Everything must be type safe and smart