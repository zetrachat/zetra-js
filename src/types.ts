export type Visibility = "public" | "private";

export interface Agent {
  id: string;
  name: string;
  /** Omitted when a public agent is read without a key. */
  instructions?: string;
  model: string;
  visibility: Visibility;
  welcomeMessage?: string;
  createdAt: string;
}

export interface AgentCreate {
  name: string;
  instructions?: string;
  model?: string;
  visibility?: Visibility;
  welcomeMessage?: string;
}

export interface Source {
  id: string;
  agentId: string;
  type: "text" | "url";
  title: string;
  status: "processing" | "ready" | "failed";
  createdAt: string;
}

export type SourceCreate =
  | { type: "text"; content: string; title?: string }
  | { type: "url"; url: string; title?: string };

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
}

export interface ChatResponse {
  conversationId: string;
  message: Message;
}

export type StreamEvent =
  | { type: "start"; conversationId: string; messageId: string }
  | { type: "delta"; text: string }
  | { type: "done"; conversationId: string; messageId: string; content: string };
