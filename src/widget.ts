/**
 * Zetra web chat widget. Drop onto any page:
 *
 *   <script src="https://cdn.zetra.ai/embed.js" data-agent-id="agt_demo" defer></script>
 *
 * Attributes: data-agent-id (required), data-base-url, data-color, data-title,
 * data-position ("right" | "left"), data-open ("true" to start open).
 * JS API: window.ZetraWidget.open() / .close() / .toggle() / .reset()
 */
import { Zetra } from "./client.js";

interface WidgetConfig {
  agentId: string;
  baseUrl?: string;
  color: string;
  title: string;
  position: "right" | "left";
  startOpen: boolean;
}

function readConfig(): WidgetConfig | null {
  const script =
    (document.currentScript as HTMLScriptElement | null) ??
    document.querySelector<HTMLScriptElement>("script[data-agent-id]");
  const agentId = script?.dataset.agentId;
  if (!script || !agentId) {
    console.error("[Zetra] Missing data-agent-id on the embed script tag.");
    return null;
  }
  const d = script.dataset;
  return {
    agentId,
    baseUrl: d.baseUrl,
    color: /^#[0-9a-f]{3,8}$/i.test(d.color ?? "") ? d.color! : "#5b3df5",
    title: d.title ?? "Chat with us",
    position: d.position === "left" ? "left" : "right",
    startOpen: d.open === "true",
  };
}

const store = {
  get(k: string) {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k: string, v: string | null) {
    try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage blocked */ }
  },
};

function css(c: WidgetConfig) {
  const side = c.position === "left" ? "left" : "right";
  return `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .launcher { position: fixed; bottom: 20px; ${side}: 20px; width: 56px; height: 56px; border-radius: 50%;
    border: 0; background: ${c.color}; color: #fff; cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,.2);
    display: grid; place-items: center; z-index: 2147483000; transition: transform .15s; }
  .launcher:hover { transform: scale(1.06); }
  .launcher:focus-visible, button:focus-visible, textarea:focus-visible { outline: 3px solid ${c.color}55; outline-offset: 2px; }
  .panel { position: fixed; bottom: 88px; ${side}: 20px; width: min(380px, calc(100vw - 32px));
    height: min(560px, calc(100vh - 120px)); background: var(--bg); color: var(--fg); border-radius: 16px;
    box-shadow: 0 12px 40px rgba(0,0,0,.25); display: none; flex-direction: column; overflow: hidden; z-index: 2147483000;
    --bg: #fff; --fg: #111827; --muted: #6b7280; --bubble: #f3f4f6; --border: #e5e7eb; }
  @media (prefers-color-scheme: dark) { .panel { --bg: #111318; --fg: #f3f4f6; --muted: #9ca3af; --bubble: #1f2330; --border: #2a2f3a; } }
  .panel.open { display: flex; }
  header { background: ${c.color}; color: #fff; padding: 14px 16px; display: flex; align-items: center; gap: 8px; }
  header h2 { font-size: 15px; font-weight: 600; margin: 0; flex: 1; }
  header button { background: transparent; border: 0; color: #fff; cursor: pointer; font-size: 13px; opacity: .9; padding: 4px 6px; border-radius: 6px; }
  header button:hover { background: rgba(255,255,255,.15); }
  .log { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
  .msg { max-width: 85%; padding: 10px 12px; border-radius: 14px; font-size: 14px; line-height: 1.45; white-space: pre-wrap; word-wrap: break-word; }
  .assistant { background: var(--bubble); align-self: flex-start; border-bottom-left-radius: 4px; }
  .user { background: ${c.color}; color: #fff; align-self: flex-end; border-bottom-right-radius: 4px; }
  .error { color: #dc2626; font-size: 13px; align-self: center; }
  .typing::after { content: "▍"; animation: blink 1s steps(2) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  form { display: flex; gap: 8px; padding: 12px; border-top: 1px solid var(--border); }
  textarea { flex: 1; resize: none; border: 1px solid var(--border); border-radius: 10px; padding: 9px 10px; font-size: 14px;
    background: transparent; color: var(--fg); max-height: 120px; }
  form button { border: 0; background: ${c.color}; color: #fff; border-radius: 10px; padding: 0 14px; font-weight: 600; cursor: pointer; }
  form button:disabled { opacity: .5; cursor: default; }
  .brand { text-align: center; font-size: 11px; color: var(--muted); padding: 0 0 8px; }
  `;
}

function mount(config: WidgetConfig) {
  const client = new Zetra({ baseUrl: config.baseUrl });
  const storageKey = `zetra:conv:${config.agentId}`;
  let conversationId = store.get(storageKey) ?? undefined;
  let busy = false;
  let greeted = false;

  const host = document.createElement("div");
  host.id = "zetra-widget";
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>${css(config)}</style>
    <button class="launcher" aria-label="Open chat" aria-expanded="false">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    </button>
    <section class="panel" role="dialog" aria-label="">
      <header><h2></h2><button class="reset" type="button" title="Start a new conversation">New</button><button class="close" type="button" aria-label="Close chat">✕</button></header>
      <div class="log" role="log" aria-live="polite"></div>
      <form><textarea rows="1" placeholder="Type a message…" aria-label="Message"></textarea><button type="submit">Send</button></form>
      <div class="brand">Powered by Zetra</div>
    </section>`;

  const $ = <T extends Element>(s: string) => root.querySelector(s) as T;
  const launcher = $<HTMLButtonElement>(".launcher");
  const panel = $<HTMLElement>(".panel");
  const log = $<HTMLDivElement>(".log");
  const form = $<HTMLFormElement>("form");
  const input = $<HTMLTextAreaElement>("textarea");
  const sendBtn = $<HTMLButtonElement>("form button");
  $<HTMLElement>("h2").textContent = config.title;
  panel.setAttribute("aria-label", config.title);

  const bubble = (role: "user" | "assistant" | "error", text = "") => {
    const el = document.createElement("div");
    el.className = role === "error" ? "error" : `msg ${role}`;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  };

  async function greet() {
    if (greeted) return;
    greeted = true;
    if (conversationId) {
      try {
        for (const m of await client.conversations.messages(conversationId)) bubble(m.role, m.content);
        return;
      } catch {
        conversationId = undefined;
        store.set(storageKey, null);
      }
    }
    try {
      const agent = await client.agents.get(config.agentId).catch(() => null);
      bubble("assistant", agent?.welcomeMessage ?? "Hi! How can I help?");
    } catch { /* ignore */ }
  }

  const setOpen = (open: boolean) => {
    panel.classList.toggle("open", open);
    launcher.setAttribute("aria-expanded", String(open));
    launcher.setAttribute("aria-label", open ? "Close chat" : "Open chat");
    if (open) {
      greet();
      setTimeout(() => input.focus(), 0);
    }
  };

  async function send(text: string) {
    busy = true;
    sendBtn.disabled = true;
    bubble("user", text);
    const out = bubble("assistant");
    out.classList.add("typing");
    try {
      for await (const evt of client.chatStream(config.agentId, { message: text, conversationId })) {
        if (evt.type === "start" || evt.type === "done") {
          conversationId = evt.conversationId;
          store.set(storageKey, conversationId);
        }
        if (evt.type === "delta") {
          out.textContent += evt.text;
          log.scrollTop = log.scrollHeight;
        }
      }
    } catch (err) {
      out.remove();
      bubble("error", "Sorry, something went wrong. Please try again.");
      console.error("[Zetra]", err);
    } finally {
      out.classList.remove("typing");
      busy = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  launcher.addEventListener("click", () => setOpen(!panel.classList.contains("open")));
  $<HTMLButtonElement>(".close").addEventListener("click", () => setOpen(false));
  $<HTMLButtonElement>(".reset").addEventListener("click", () => {
    conversationId = undefined;
    store.set(storageKey, null);
    log.replaceChildren();
    greeted = false;
    greet();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = "";
    send(text);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });

  (window as unknown as { ZetraWidget: unknown }).ZetraWidget = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!panel.classList.contains("open")),
    reset: () => $<HTMLButtonElement>(".reset").click(),
  };
  if (config.startOpen) setOpen(true);
}

const config = readConfig();
if (config) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => mount(config));
  else mount(config);
}
