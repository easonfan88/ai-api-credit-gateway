import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { KeyRound, Zap, CreditCard, Terminal, ShieldCheck, Activity, BookOpen, AlertTriangle } from "lucide-react";
import { ClerkProvider, SignedIn, SignedOut, SignInButton, SignUpButton, UserButton, useUser, useAuth } from "@clerk/clerk-react";
import "./style.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:4242";

const money = (cents) => `$${(cents / 100).toFixed(2)}`;

function App() {
  const { user: clerkUser, isLoaded, isSignedIn } = useUser();
  const { getToken } = useAuth();

  const [config, setConfig] = useState({ packages: {}, models: {} });
  const [backendUser, setBackendUser] = useState(null);
  const [me, setMe] = useState(null);
  const [message, setMessage] = useState("");
  const [newKey, setNewKey] = useState("");
  const [keyName, setKeyName] = useState("My first API key");
  const [playgroundInput, setPlaygroundInput] = useState("Write a short hello message from my AI API gateway.");
  const [playgroundModel, setPlaygroundModel] = useState("mock-fast");
  const [playgroundOutput, setPlaygroundOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const loggedIn = Boolean(backendUser?.id);

  async function publicApi(path, options = {}) {
    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : data.error?.message || data.error || "Request failed.");
    }

    return data;
  }

  async function authedApi(path, options = {}) {
    const token = await getToken();

    if (!token) {
      throw new Error("No Clerk token found. Sign out and sign in again.");
    }

    const res = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : data.error?.message || data.error || "Request failed.");
    }

    return data;
  }

  async function refresh() {
    if (!isSignedIn) return;

    const data = await authedApi("/api/me");
    setMe(data);
    setBackendUser(data.user);
  }

  useEffect(() => {
    publicApi("/api/config")
      .then(setConfig)
      .catch(e => setMessage(e.message));
  }, []);

  useEffect(() => {
    async function syncClerkUserToBackend() {
      if (!isLoaded || !isSignedIn || !clerkUser) return;

      try {
        const d = await authedApi("/api/auth/demo-login", {
          method: "POST",
          body: JSON.stringify({})
        });

        setBackendUser(d.user);
        setMe({ user: d.user, wallet: d.wallet, apiKeys: [], usage: [], transactions: [] });
        setMessage("Account connected.");
        await refresh();
      } catch (e) {
        setMessage(e.message);
      }
    }

    syncClerkUserToBackend();
  }, [isLoaded, isSignedIn, clerkUser?.id]);

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setBackendUser(null);
      setMe(null);
      setNewKey("");
      setMessage("");
    }
  }, [isLoaded, isSignedIn]);

  async function demoTopup(packageId) {
    try {
      const d = await authedApi("/api/billing/demo-topup", {
        method: "POST",
        body: JSON.stringify({ packageId })
      });

      setMessage(`Added ${d.package.credits.toLocaleString()} credits.`);
      await refresh();
    } catch (e) {
      setMessage(e.message);
    }
  }

  async function createKey() {
    try {
      const d = await authedApi("/api/keys", {
        method: "POST",
        body: JSON.stringify({ name: keyName })
      });

      setNewKey(d.plainKey);
      setMessage("API key created. Copy it now; it will only be shown once.");
      await refresh();
    } catch (e) {
      setMessage(e.message);
    }
  }

  async function deleteKey(id) {
    try {
      await authedApi(`/api/keys/${id}`, { method: "DELETE" });
      setMessage("API key deleted.");
      await refresh();
    } catch (e) {
      setMessage(e.message);
    }
  }

  async function runPlayground() {
    setIsRunning(true);
    setPlaygroundOutput("");

    try {
      const d = await authedApi("/api/playground/chat", {
        method: "POST",
        body: JSON.stringify({ model: playgroundModel, input: playgroundInput })
      });

      setPlaygroundOutput(d.output);
      await refresh();
    } catch (e) {
      setPlaygroundOutput(`Error: ${e.message}`);
      setMessage(e.message);
    } finally {
      setIsRunning(false);
    }
  }

  const packages = useMemo(() => Object.values(config.packages || {}), [config]);
  const models = useMemo(() => Object.entries(config.models || {}), [config]);
  const shownKey = newKey || "YOUR_PLATFORM_API_KEY";

  const psExample = `$apiKey = "${shownKey}"\n\n$headers = @{\n  "Authorization" = "Bearer $apiKey"\n  "Content-Type" = "application/json"\n}\n\n$body = @{\n  model = "mock-fast"\n  messages = @(\n    @{\n      role = "user"\n      content = "Say hello from my API gateway."\n    }\n  )\n} | ConvertTo-Json -Depth 10\n\n$response = Invoke-RestMethod -Uri "http://localhost:4242/v1/chat/completions" -Method POST -Headers $headers -Body $body\n\n$response.choices[0].message.content`;

  return (
    <>
      <SignedOut>
        <main>
          <nav>
            <div className="brand"><Zap size={22}/> AI API Credit Gateway v2</div>
          </nav>

          <section className="hero">
            <div>
              <div className="badge"><ShieldCheck size={16}/> Secure login required</div>
              <h1>Sign in to use your AI API Gateway.</h1>
              <p>Create an account or sign in before accessing credits, API keys, and model routing.</p>

              <div className="login authBox">
                <SignInButton mode="modal">
                  <button>Sign in</button>
                </SignInButton>

                <SignUpButton mode="modal">
                  <button className="ghost">Sign up</button>
                </SignUpButton>
              </div>
            </div>

            <div className="diagram">
              <div>Sign in</div>
              <span>↓</span>
              <div>Dashboard</div>
              <span>↓</span>
              <div>Credits + API keys</div>
            </div>
          </section>
        </main>
      </SignedOut>

      <SignedIn>
        <main>
          <nav>
            <div className="brand"><Zap size={22}/> AI API Credit Gateway v2</div>
            <div className="navActions">
              <UserButton />
            </div>
          </nav>

          <section className="hero">
            <div>
              <div className="badge"><ShieldCheck size={16}/> Platform credits, API keys, model routing</div>
              <h1>Build your own AI API额度平台.</h1>
              <p>Users buy platform credits, generate API keys, call your gateway, and spend credits based on model usage.</p>

              {!loggedIn ? (
                <div className="wallet">
                  <span>Setting up your account...</span>
                  <strong>Loading</strong>
                </div>
              ) : (
                <div className="wallet">
                  <span>Signed in as {backendUser.email}</span>
                  <strong>{(me?.wallet?.balance || 0).toLocaleString()} credits</strong>
                </div>
              )}

              {message && <p className="message">{message}</p>}
            </div>

            <div className="diagram">
              <div>User App</div>
              <span>↓ API key</span>
              <div>Your Gateway</div>
              <span>↓ routing</span>
              <div>AI Provider</div>
              <span>↓ usage</span>
              <div>Credit deduction</div>
            </div>
          </section>

          <section className="section">
            <h2><CreditCard size={22}/> Credit packages</h2>
            <div className="cards">
              {packages.map(p => (
                <div className="card" key={p.id}>
                  <h3>{p.name}</h3>
                  <div className="price">{money(p.priceCents)}</div>
                  <p>{p.credits.toLocaleString()} platform credits</p>
                  <button disabled={!loggedIn} onClick={() => demoTopup(p.id)}>Demo top-up</button>
                </div>
              ))}
            </div>
          </section>

          {loggedIn && (
            <>
              <section className="section grid2">
                <div className="panel">
                  <h2><KeyRound size={22}/> API keys</h2>
                  <p className="warning"><AlertTriangle size={16}/> Full keys are shown once only. Copy immediately.</p>
                  <input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="Key name"/>
                  <button onClick={createKey}>Create API key</button>

                  {newKey && <div className="secret"><b>Copy this key now:</b><code>{newKey}</code></div>}

                  {(me?.apiKeys || []).map(k => (
                    <div className="listItem" key={k.id}>
                      <div>
                        <b>{k.name}</b>
                        <span>{k.key_prefix} · {k.active ? "active" : "disabled"}</span>
                      </div>
                      <button className="danger" onClick={() => deleteKey(k.id)}>Delete</button>
                    </div>
                  ))}
                </div>

                <div className="panel">
                  <h2><Terminal size={22}/> PowerShell API example</h2>
                  <pre>{psExample}</pre>
                </div>
              </section>

              <section className="section grid2">
                <div className="panel">
                  <h2>Playground</h2>
                  <label>Model</label>
                  <select value={playgroundModel} onChange={e => setPlaygroundModel(e.target.value)}>
                    {models.map(([id, m]) => <option key={id} value={id}>{m.displayName}</option>)}
                  </select>

                  <label>Prompt</label>
                  <textarea value={playgroundInput} onChange={e => setPlaygroundInput(e.target.value)}/>
                  <button disabled={isRunning} onClick={runPlayground}>{isRunning ? "Running..." : "Run test call"}</button>
                </div>

                <div className="panel output">
                  <h2>Output</h2>
                  {playgroundOutput ? <pre>{playgroundOutput}</pre> : <p className="muted">Run a test call to see output.</p>}
                </div>
              </section>

              <section className="section grid2">
                <div className="panel">
                  <h2><Activity size={22}/> Recent API usage</h2>
                  {(me?.usage || []).map(u => (
                    <div className="listItem" key={u.id}>
                      <div>
                        <b>{u.model}</b>
                        <span>{u.input_tokens} in / {u.output_tokens} out · {u.status}{u.error_message ? ` · ${u.error_message}` : ""}</span>
                      </div>
                      <b>{u.credits_used} credits</b>
                    </div>
                  ))}
                </div>

                <div className="panel">
                  <h2>Transactions</h2>
                  {(me?.transactions || []).map(t => (
                    <div className="listItem" key={t.id}>
                      <span>{t.description}</span>
                      <b className={t.amount > 0 ? "positive" : "negative"}>{t.amount > 0 ? "+" : ""}{t.amount}</b>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          <section className="section">
            <h2><BookOpen size={22}/> API Docs</h2>
            <div className="docs">
              <div className="docBlock"><h3>Base URL</h3><code>http://localhost:4242</code></div>
              <div className="docBlock"><h3>Endpoint</h3><code>POST /v1/chat/completions</code></div>
              <div className="docBlock"><h3>Authentication</h3><code>Authorization: Bearer YOUR_API_KEY</code></div>
              <div className="docBlock"><h3>Models</h3><ul>{models.map(([id, m]) => <li key={id}><b>{id}</b> — {m.displayName}</li>)}</ul></div>
              <div className="docBlock wide"><h3>Errors</h3><ul><li><b>401</b> missing/invalid/disabled API key</li><li><b>402</b> insufficient platform credits or provider quota</li><li><b>502</b> provider key/model error</li></ul></div>
            </div>
          </section>

          <footer>Platform credits are only usable inside this gateway service. They are not cryptocurrency, securities, investments, stored-value accounts, or cash equivalents.</footer>
        </main>
      </SignedIn>
    </>
  );
}

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in client/.env");
}

createRoot(document.getElementById("root")).render(
  <ClerkProvider publishableKey={clerkKey}>
    <App />
  </ClerkProvider>
);
