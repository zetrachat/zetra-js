import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Zetra, ZetraError } from "../dist/index.js";

// Runs against the mock server from the zetra-api repo (sibling folder by default).
const MOCK = process.env.ZETRA_MOCK_PATH ?? fileURLToPath(new URL("../../zetra-api/mock-server/server.mjs", import.meta.url));
const PORT = 4100 + Math.floor(Math.random() * 500);
const baseUrl = `http://localhost:${PORT}/v1`;
let proc;

before(async () => {
  proc = spawn(process.execPath, [MOCK], { env: { ...process.env, PORT: String(PORT), STREAM_DELAY_MS: "1" } });
  await new Promise((resolve, reject) => {
    proc.stdout.on("data", (d) => d.toString().includes("Zetra mock API") && resolve());
    proc.on("error", reject);
  });
});
after(() => proc?.kill());

const admin = () => new Zetra({ apiKey: "zk_test_123", baseUrl });
const anon = () => new Zetra({ apiKey: undefined, baseUrl });

test("lists agents with a key", async () => {
  const agents = await admin().agents.list();
  assert.ok(agents.some((a) => a.id === "agt_demo"));
});

test("rejects missing key with ZetraError", async () => {
  await assert.rejects(anon().agents.list(), (e) => e instanceof ZetraError && e.status === 401 && e.code === "unauthorized");
});

test("public agent readable without key, instructions hidden", async () => {
  const a = await anon().agents.get("agt_demo");
  assert.equal(a.name, "Zetra Demo");
  assert.equal(a.instructions, undefined);
});

test("create agent, add source, chat uses source", async () => {
  const z = admin();
  const agent = await z.agents.create({ name: "Test Bot" });
  assert.equal(agent.visibility, "private");
  await z.sources.add(agent.id, { type: "text", title: "Hours", content: "Our office hours are 8am to 5pm Monday to Friday." });
  const res = await z.chat(agent.id, { message: "What are your office hours?" });
  assert.match(res.message.content, /8am to 5pm/);
  // private agent needs a key
  await assert.rejects(anon().chat(agent.id, { message: "hi" }), (e) => e.status === 401);
  await z.agents.delete(agent.id);
  await assert.rejects(z.agents.get(agent.id), (e) => e.status === 404);
});

test("streams deltas that add up to the final content", async () => {
  let text = "";
  let done;
  for await (const evt of anon().chatStream("agt_demo", { message: "Tell me about pricing" })) {
    if (evt.type === "delta") text += evt.text;
    if (evt.type === "done") done = evt;
  }
  assert.ok(done);
  assert.equal(text, done.content);
  assert.match(text, /Pro plan/);
});

test("Conversation keeps history across turns", async () => {
  const z = anon();
  const convo = z.conversation("agt_demo");
  await convo.send("hello");
  const firstId = convo.id;
  let streamed = "";
  for await (const chunk of convo.stream("which SDKs exist?")) streamed += chunk;
  assert.equal(convo.id, firstId);
  assert.match(streamed, /Kotlin/);
  const msgs = await z.conversations.messages(convo.id);
  assert.deepEqual(msgs.map((m) => m.role), ["user", "assistant", "user", "assistant"]);
});

test("unknown agent is a 404", async () => {
  await assert.rejects(anon().chat("agt_nope", { message: "hi" }), (e) => e.status === 404 && e.code === "not_found");
});
