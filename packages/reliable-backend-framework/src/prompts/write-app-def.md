(pasted text README.md)

Help me write `AppDefinition` type.
It must receive as type params:
context (provided context, typed, usable in queries and mutations)
schema, (dirzzle-orm tables). The Databse type is PostgresJsDatabase<SchemaType>
queues names must be type safe when calling mutations and queries.
mutations and queries reference queues by name, that must infer the modified context from the queue.
The app also has the `mutation` and `query` methods, that must be typed.
The `mutation` method must return a `MutationDefinition` type, that must be typed.
The `query` method must return a `QueryDefinition` type, that must be typed.
The `mutation` and `query` methods must be typed.
The `mutation` and `query` methods must be typed.
Everything must be type safe and smart
type PathToParams already exists. Don't rewrite it.
A drizzle schema extends Record<string, unknown>. For example: TSchema extends Record<string, unknown>
A drizzle transaction is a type: PostgresJsTransaction<PostgresJsQueryResultHKT, TSchema, ExtractTablesWithRelations<TSchema>>
Write all as a single types file.

You can use:
```ts
AppDefinition<
    TBaseContext,
    TSchema,
    TQueues // queue keys or something
>
```

schema and queues should have a default type.