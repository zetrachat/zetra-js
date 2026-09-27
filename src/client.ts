import { parseSSE } from "./sse.js";
import type {
  Agent,
  AgentCreate,
  ChatRequest,
  ChatResponse,
  Message,
  Source,
  SourceCreate,
  StreamEvent,
} from "./types.js";

export const DEFAULT_BASE_URL = "https://api.zetra.ai/v1";

export interface ZetraOptions {
  /** Secret key (`zk_...`). Server-side only. Omit to chat with public agents from browsers/apps. */
  apiKey?: string;
  /** Defaults to https://api.zetra.ai/v1 (or ZETRA_BASE_URL in Node). */
  baseUrl?: string;
  /** Custom fetch (tests, proxies, older runtimes). */
  fetch?: typeof fetch;
  /** Request timeout for non-streaming calls, in ms. Default 30s. */
  timeoutMs?: number;
}

export class ZetraError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ZetraError";
  }
}

// Read env vars in Node/Bun/Deno without pulling in Node typings for browser users.
const env = (name: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];

export class Zetra {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: ZetraOptions = {}) {
    this.apiKey = options.apiKey ?? env("ZETRA_API_KEY");
    this.baseUrl = (options.baseUrl ?? env("ZETRA_BASE_URL") ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  // ---------- resources ----------
  readonly agents = {
    list: async (): Promise<Agent[]> => (await this.request<{ data: Agent[] }>("GET", "/agents")).data,
    create: (input: AgentCreate): Promise<Agent> => this.request("POST", "/agents", input),
    get: (agentId: string): Promise<Agent> => this.request("GET", `/agents/${enc(agentId)}`),
    delete: async (agentId: string): Promise<void> => {
      await this.request("DELETE", `/agents/${enc(agentId)}`);
    },
  };

  readonly sources = {
    list: async (agentId: string): Promise<Source[]> =>
      (await this.request<{ data: Source[] }>("GET", `/agents/${enc(agentId)}/sources`)).data,
    add: (agentId: string, input: SourceCreate): Promise<Source> =>
      this.request("POST", `/agents/${enc(agentId)}/sources`, input),
  };

  readonly conversations = {
    messages: async (conversationId: string): Promise<Message[]> =>
      (await this.request<{ data: Message[] }>("GET", `/conversations/${enc(conversationId)}/messages`)).data,
  };

  /** Send a message and wait for the full reply. */
  chat(agentId: string, req: ChatRequest): Promise<ChatResponse> {
    return this.request("POST", `/agents/${enc(agentId)}/chat`, { ...req, stream: false });
  }

  /** Send a message and receive the reply token-by-token. */
  async *chatStream(agentId: string, req: ChatRequest & { signal?: AbortSignal }): AsyncGenerator<StreamEvent> {
    const { signal, ...body } = req;
    const res = await this.fetchImpl(`${this.baseUrl}/agents/${enc(agentId)}/chat`, {
      method: "POST",
      headers: { ...this.headers(), Accept: "text/event-stream" },
      body: JSON.stringify({ ...body, stream: true }),
      signal,
    });
    if (!res.ok) throw await toError(res);
    if (!res.body) throw new ZetraError("Streaming not supported by this runtime", 0, "stream_unsupported");

    for await (const evt of parseSSE(res.body)) {
      const data = JSON.parse(evt.data);
      if (evt.event === "error") throw new ZetraError(data.message ?? "Stream error", 0, data.code ?? "stream_error");
      if (evt.event === "start" || evt.event === "delta" || evt.event === "done") yield { type: evt.event, ...data };
    }
  }

  /** Stateful helper that remembers the conversation id between turns. */
  conversation(agentId: string, conversationId?: string): Conversation {
    return new Conversation(this, agentId, conversationId);
  }

  // ---------- internals ----------
  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) h.Authorization = `Bearer ${this.apiKey}`;
    return h;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: this.headers(),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const aborted = (err as Error).name === "AbortError";
      throw new ZetraError(
        aborted ? `Request timed out after ${this.timeoutMs}ms` : `Network error: ${(err as Error).message}`,
        0,
        aborted ? "timeout" : "network_error",
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw await toError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}

export class Conversation {
  constructor(
    private readonly client: Zetra,
    readonly agentId: string,
    public id?: string,
  ) {}

  async send(message: string): Promise<Message> {
    const res = await this.client.chat(this.agentId, { message, conversationId: this.id });
    this.id = res.conversationId;
    return res.message;
  }

  /** Yields text chunks; resolves the conversation id automatically. */
  async *stream(message: string, signal?: AbortSignal): AsyncGenerator<string> {
    for await (const evt of this.client.chatStream(this.agentId, { message, conversationId: this.id, signal })) {
      if (evt.type === "start" || evt.type === "done") this.id = evt.conversationId;
      if (evt.type === "delta") yield evt.text;
    }
  }
}

const enc = encodeURIComponent;

async function toError(res: Response): Promise<ZetraError> {
  let code = `http_${res.status}`;
  let message = res.statusText || `Request failed with status ${res.status}`;
  try {
    const body = await res.json();
    if (body?.error) ({ code = code, message = message } = body.error);
  } catch {
    /* non-JSON error body */
  }
  return new ZetraError(message, res.status, code);
}
