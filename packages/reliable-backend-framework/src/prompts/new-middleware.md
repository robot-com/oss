(pasted README.md)

I want to make some changes,
1. Queues may have a middleware but they can't modify the type of the context. They will receive a "Request" object that acts as a wrapper for nats msg. And they can return a new request or undefined to not change the request. They typing of the queues is not longer relevant.

2. A new middleware type is needed. It will be like `app.middleware()`

Example:
```ts
const app = defineBackend<Context>()

const protectedApp = app.middleware(async ({request, ctx}) => {

    const user = await getUser(request.user)

    return {
        request // Optional, it may or may no change the request
        ctx: {
            ...ctx,
            user: request.user,
        }
    }
})
```

Rewrite the README.md with the new middleware. Only output the file and no other assistant comments. Rewrite the full file, don't skip anything.