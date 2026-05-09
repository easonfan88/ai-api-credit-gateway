
require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { v4: uuid } = require("uuid");
const OpenAI = require("openai");
const { clerkMiddleware, getAuth, clerkClient } = require("@clerk/express");

const db = require("./db");
const { packages, models } = require("./config");

const app = express();
const port = Number(process.env.PORT || 4242);
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

app.use(cors({ origin: clientUrl, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(clerkMiddleware());

const now = () => new Date().toISOString();
const hashKey = (k) => crypto.createHash("sha256").update(k).digest("hex");
const makeKey = () => `aigw_${crypto.randomBytes(32).toString("hex")}`;
const estimateTokens = (text) => Math.max(1, Math.ceil(String(text || "").length / 4));
const estimateInputTokens = (messages) => estimateTokens((messages || []).map(m => `${m.role || ""}: ${m.content || ""}`).join("\\n"));

function creditsFor(model, inputTokens, outputTokens) {
  const p = models[model] || models["mock-fast"];
  return Math.max(p.minCredits, Math.ceil(inputTokens / 1000 * p.creditsPer1kInput) + Math.ceil(outputTokens / 1000 * p.creditsPer1kOutput));
}

function wallet(userId) {
  return db.prepare("SELECT * FROM credit_wallets WHERE user_id=?").get(userId);
}

function addCredits(userId, amount, desc, type="purchase") {
  db.prepare("UPDATE credit_wallets SET balance = balance + ? WHERE user_id=?").run(amount, userId);
  db.prepare("INSERT INTO credit_transactions VALUES (?,?,?,?,?,?)").run(uuid(), userId, type, amount, desc, now());
  return wallet(userId);
}

function deductCredits(userId, amount, desc) {
  const w = wallet(userId);
  if (!w || w.balance < amount) {
    const e = new Error(`Insufficient credits. Required ${amount}, available ${w ? w.balance : 0}.`);
    e.statusCode = 402;
    throw e;
  }
  db.prepare("UPDATE credit_wallets SET balance = balance - ? WHERE user_id=?").run(amount, userId);
  db.prepare("INSERT INTO credit_transactions VALUES (?,?,?,?,?,?)").run(uuid(), userId, "usage", -amount, desc, now());
  return wallet(userId);
}

function logUsage(userId, keyId, model, inputTokens, outputTokens, creditsUsed, status, errorMessage=null) {
  db.prepare("INSERT INTO api_usage_logs VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run(uuid(), userId, keyId, model, inputTokens, outputTokens, creditsUsed, status, errorMessage, now());
}

function getOrCreateUser(email) {
  if (!email || !String(email).includes("@")) throw new Error("A valid email is required.");
  email = String(email).trim().toLowerCase();
  let user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!user) {
    user = { id: uuid(), email, created_at: now() };
    db.prepare("INSERT INTO users VALUES (?,?,?)").run(user.id, user.email, user.created_at);
    db.prepare("INSERT INTO credit_wallets VALUES (?,0)").run(user.id);
  }
  return user;
}

async function requireUser(req, res, next) {
  try {
    const auth = getAuth(req);
    if (!auth.userId) return res.status(401).json({ error: "Missing or invalid Clerk session." });

    const clerkUser = await clerkClient.users.getUser(auth.userId);
    const email = clerkUser.primaryEmailAddress?.emailAddress || clerkUser.emailAddresses?.[0]?.emailAddress;
    if (!email) return res.status(400).json({ error: "No email found for Clerk user." });

    req.user = getOrCreateUser(email);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Could not verify Clerk session." });
  }
}

function requireGatewayKey(req, res, next) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: { message: "Missing Authorization: Bearer API_KEY", type: "authentication_error" }});

  const key = db.prepare("SELECT * FROM api_keys WHERE key_hash=? AND active=1").get(hashKey(match[1].trim()));
  if (!key) return res.status(401).json({ error: { message: "Invalid or disabled API key.", type: "authentication_error" }});

  db.prepare("UPDATE api_keys SET last_used_at=? WHERE id=?").run(now(), key.id);
  req.gatewayKey = key;
  next();
}

function providerError(err) {
  if (err?.code === "insufficient_quota") return { status: 402, message: "Provider quota exceeded. Check OpenAI billing.", type: "provider_quota_error" };
  if (err?.code === "invalid_api_key" || err?.status === 401) return { status: 502, message: "Provider API key is invalid. Check OPENAI_API_KEY in .env.", type: "provider_auth_error" };
  if (err?.status === 429) return { status: 429, message: "Provider rate limit reached.", type: "provider_rate_limit" };
  return { status: 502, message: "Provider call failed.", type: "provider_error" };
}

async function callGateway({ userId, keyId, model, messages }) {
  const inputTokens = estimateInputTokens(messages);
  const precharge = creditsFor(model, inputTokens, 800);
  deductCredits(userId, precharge, `Pre-charge API call: ${model}`);

  try {
    let content, outputTokens, providerResponse = null;
    if (models[model].provider === "openai" && openai) {
      providerResponse = await openai.chat.completions.create({ model, messages, temperature: 0.7 });
      content = providerResponse.choices?.[0]?.message?.content || "";
      outputTokens = providerResponse.usage?.completion_tokens || estimateTokens(content);
    } else {
      content = "Mock gateway response. Your platform API key, credit deduction, and OpenAI-compatible endpoint are working. Add OPENAI_API_KEY to .env for real model calls.";
      outputTokens = estimateTokens(content);
    }

    const actual = creditsFor(model, inputTokens, outputTokens);
    const refund = Math.max(0, precharge - actual);
    if (refund) addCredits(userId, refund, `Refund unused pre-charge: ${model}`, "refund");
    logUsage(userId, keyId, model, inputTokens, outputTokens, actual, "completed");

    return providerResponse || {
      id: `chatcmpl_${uuid()}`,
      object: "chat.completion",
      created: Math.floor(Date.now()/1000),
      model,
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
      gateway_billing: { credits_used: actual, refunded: refund }
    };
  } catch (err) {
    addCredits(userId, precharge, `Refund failed API call: ${model}`, "refund");
    logUsage(userId, keyId, model, inputTokens, 0, 0, "failed", err.message);
    throw err;
  }
}

app.get("/api/health", (_, res) => res.json({ ok: true, server: "secure-clerk-backend" }));
app.get("/api/config", (_, res) => res.json({ packages, models }));

app.post("/api/auth/demo-login", requireUser, (req, res) => {
  res.json({ user: req.user, wallet: wallet(req.user.id) });
});

app.get("/api/me", requireUser, (req, res) => {
  res.json({
    user: req.user,
    wallet: wallet(req.user.id),
    apiKeys: db.prepare("SELECT id,name,key_prefix,active,created_at,last_used_at FROM api_keys WHERE user_id=? ORDER BY created_at DESC").all(req.user.id),
    usage: db.prepare("SELECT id,model,input_tokens,output_tokens,credits_used,status,error_message,created_at FROM api_usage_logs WHERE user_id=? ORDER BY created_at DESC LIMIT 30").all(req.user.id),
    transactions: db.prepare("SELECT * FROM credit_transactions WHERE user_id=? ORDER BY created_at DESC LIMIT 30").all(req.user.id)
  });
});

app.post("/api/billing/demo-topup", requireUser, (req, res) => {
  const pack = packages[req.body.packageId];
  if (!pack) return res.status(400).json({ error: "Invalid package." });
  res.json({ package: pack, wallet: addCredits(req.user.id, pack.credits, `Demo top-up: ${pack.name}`) });
});

app.post("/api/keys", requireUser, (req, res) => {
  const plainKey = makeKey();
  const rec = {
    id: uuid(),
    user_id: req.user.id,
    name: String(req.body.name || "Default key").slice(0,80),
    key_prefix: `${plainKey.slice(0,10)}...${plainKey.slice(-4)}`,
    key_hash: hashKey(plainKey),
    active: 1,
    created_at: now()
  };
  db.prepare("INSERT INTO api_keys (id,user_id,name,key_prefix,key_hash,active,created_at) VALUES (?,?,?,?,?,?,?)")
    .run(rec.id, rec.user_id, rec.name, rec.key_prefix, rec.key_hash, rec.active, rec.created_at);
  res.json({ apiKey: { id: rec.id, name: rec.name, key_prefix: rec.key_prefix }, plainKey, warning: "Full API key is shown once only. Copy it immediately." });
});

app.delete("/api/keys/:id", requireUser, (req, res) => {
  const info = db.prepare("DELETE FROM api_keys WHERE id=? AND user_id=?").run(req.params.id, req.user.id);
  if (!info.changes) return res.status(404).json({ error: "API key not found." });
  res.json({ ok: true });
});

app.post("/v1/chat/completions", requireGatewayKey, async (req, res) => {
  try {
    const model = models[req.body.model] ? req.body.model : "mock-fast";
    if (!Array.isArray(req.body.messages)) return res.status(400).json({ error: { message: "messages must be an array.", type: "invalid_request_error" }});
    const response = await callGateway({ userId: req.gatewayKey.user_id, keyId: req.gatewayKey.id, model, messages: req.body.messages });
    res.json(response);
  } catch (err) {
    if (err.statusCode === 402) return res.status(402).json({ error: { message: err.message, type: "insufficient_credits" }});
    const pe = providerError(err);
    res.status(pe.status).json({ error: { message: pe.message, type: pe.type, detail: err.message }});
  }
});

app.post("/api/playground/chat", requireUser, async (req, res) => {
  try {
    const key = db.prepare("SELECT * FROM api_keys WHERE user_id=? AND active=1 ORDER BY created_at DESC").get(req.user.id);
    if (!key) return res.status(400).json({ error: "Create an API key first." });
    const model = models[req.body.model] ? req.body.model : "mock-fast";
    const response = await callGateway({ userId: req.user.id, keyId: key.id, model, messages: [{ role: "user", content: String(req.body.input || "") }] });
    res.json({ output: response.choices?.[0]?.message?.content || "No response.", wallet: wallet(req.user.id) });
  } catch (err) {
    if (err.statusCode === 402) return res.status(402).json({ error: err.message });
    const pe = providerError(err);
    res.status(pe.status).json({ error: pe.message, detail: err.message });
  }
});

app.use((err, req, res, next) => {
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: { message: "Invalid JSON body.", type: "invalid_json" }});
  console.error(err);
  res.status(500).json({ error: { message: "Unexpected server error.", type: "server_error" }});
});

app.listen(port, () => console.log(`AI API Credit Gateway secure backend running at http://localhost:${port}`));
