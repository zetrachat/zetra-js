# @zetra/sdk

Official JavaScript/TypeScript SDK for [Zetra](https://zetra.ai) AI agents — plus a drop-in web chat widget.

- Zero runtime dependencies. Works in Node 18+, browsers, Deno, Bun and edge runtimes.
- Full typings, streaming via Server-Sent Events, typed `ZetraError`s.

## Install

```bash
npm install @zetra/sdk
```

## Server-side (secret key)

```ts
import { Zetra } from "@zetra/sdk";

const zetra = new Zetra({ apiKey: process.env.ZETRA_API_KEY });

const agent = await zetra.agents.create({ name: "Support Bot", visibility: "public" });
await zetra.sources.add(agent.id, { type: "url", url: "https://example.com/faq" });

const { message, conversationId } = await zetra.chat(agent.id, { message: "What are your hours?" });
console.log(message.content);
```

## Streaming

```ts
for await (const evt of zetra.chatStream("agt_demo", { message: "Tell me about pricing" })) {
  if (evt.type === "delta") process.stdout.write(evt.text);
}
```

## Conversations

```ts
const convo = zetra.conversation("agt_demo");
await convo.send("Hi!");
for await (const chunk of convo.stream("And the Pro plan?")) process.stdout.write(chunk);
console.log(convo.id); // persist to resume later: zetra.conversation("agt_demo", savedId)
```

## Browser (public agents, no key)

```ts
const zetra = new Zetra(); // never ship a secret key to the browser
const reply = await zetra.chat("agt_demo", { message: "Hello" });
```

## Web widget

```html
<script src="https://cdn.zetra.ai/embed.js" data-agent-id="agt_demo" defer></script>
```

| Attribute        | Default         | Notes                               |
|------------------|-----------------|-------------------------------------|
| `data-agent-id`  | —               | Required. Must be a public agent.   |
| `data-title`     | `Chat with us`  | Panel header                        |
| `data-color`     | `#5b3df5`       | Hex brand color                     |
| `data-position`  | `right`         | `right` or `left`                   |
| `data-open`      | `false`         | Start open                          |
| `data-base-url`  | production API  | e.g. `http://localhost:4010/v1`     |

Control it from JS: `ZetraWidget.open()`, `.close()`, `.toggle()`, `.reset()`.
The widget renders in Shadow DOM (your CSS can't break it, and it won't touch yours), supports dark mode,
and resumes the visitor's conversation on reload.

The bundle is built to `dist/embed.js`.

## Errors

```ts
import { ZetraError } from "@zetra/sdk";
try { await zetra.agents.get("agt_x"); }
catch (e) { if (e instanceof ZetraError && e.status === 404) { /* ... */ } }
```

## Configuration

| Option      | Env var          | Default                    |
|-------------|------------------|----------------------------|
| `apiKey`    | `ZETRA_API_KEY`  | none                       |
| `baseUrl`   | `ZETRA_BASE_URL` | `https://api.zetra.ai/v1`  |
| `timeoutMs` | —                | `30000`                    |
| `fetch`     | —                | global `fetch`             |

## Development

Tests run against the mock server in the [`zetra-api`](../zetra-api) repo (expected as a sibling folder,
or set `ZETRA_MOCK_PATH`).

```bash
npm install && npm test
```

## License

MIT
