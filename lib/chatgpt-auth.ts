import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { HttpError } from "./errors";

const ISSUER = "https://auth.openai.com";
const RESOURCE = "https://api.openai.com/v1";
const PLAN_SCOPE = "chatgpt.tokens.use.direct";
const SCOPES = `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`;
export const AUTH_COOKIE = "rfq_chatgpt_login";
export const AUTH_TTL_SECONDS = 600;

const Tokens = z.object({
  accessToken: z.string().min(1), refreshToken: z.string().min(1), idToken: z.string().min(1),
  expiresAt: z.number(), scope: z.string(),
});
const Account = z.object({
  id: z.string(), clientId: z.string().min(1), subject: z.string().min(1), email: z.string().nullable(),
  tokens: Tokens.optional(),
});
const Store = z.object({ version: z.literal(1), hostId: z.string(), activeId: z.string().optional(), accounts: z.array(Account) });
type AuthStore = z.infer<typeof Store>;
type AuthAccount = z.infer<typeof Account>;
type Transaction = {
  state: string; browserId: string; verifier: string; nonce: string; redirectUri: string; expiresAt: number;
  account?: AuthAccount;
};
type Runtime = { transactions: Map<string, Transaction>; tail: Promise<unknown> };
// Shared across Next route bundles and development reloads. This app runs in one local server process.
const globals = globalThis as typeof globalThis & { rfqChatgptAuth?: Runtime };
const runtime = globals.rfqChatgptAuth ??= { transactions: new Map(), tail: Promise.resolve() };

function serialized<T>(task: () => Promise<T>): Promise<T> {
  const result = runtime.tail.then(task, task);
  runtime.tail = result.catch(() => undefined);
  return result;
}

// Runtime credentials must not be bundled by Next's filesystem tracer.
function storageDir() { return resolve(/* turbopackIgnore: true */ process.env.CHATGPT_AUTH_DIR || join(process.cwd(), ".chatgpt")); }
async function loadStore(): Promise<AuthStore> {
  try { return Store.parse(JSON.parse(await readFile(join(storageDir(), "accounts.json"), "utf8"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, hostId: `urn:uuid:${randomUUID()}`, accounts: [] };
    throw new HttpError(500, "chatgpt_storage", "Couldn't read the local ChatGPT connection. Check the credential directory.");
  }
}
async function saveStore(store: AuthStore) {
  const dir = storageDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  const temporary = join(dir, `accounts.${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify(store), { mode: 0o600 });
  await rename(temporary, join(dir, "accounts.json"));
}

export function assertLocalRequest(request: Request, mutation = false): URL {
  const url = new URL(request.url);
  // NextRequest normalizes loopback URL hostnames to localhost. Preserve the actual Host
  // for the OAuth callback and Origin comparison, validating it before use.
  const host = request.headers.get("host");
  if (host) {
    let actual: URL;
    try { actual = new URL(`http://${host}`); } catch {
      throw new HttpError(403, "chatgpt_local_only", "ChatGPT plan connections are available on the local app only.");
    }
    if (!host || actual.host !== host || actual.username || actual.password || !["127.0.0.1", "localhost", "[::1]"].includes(actual.hostname)) {
      throw new HttpError(403, "chatgpt_local_only", "ChatGPT plan connections are available on the local app only.");
    }
    url.host = actual.host;
  }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new HttpError(403, "chatgpt_local_only", "ChatGPT plan connections are available on the local app only.");
  }
  if (mutation && request.headers.get("origin") !== url.origin) {
    throw new HttpError(403, "chatgpt_origin", "This action must come from the local app.");
  }
  return url;
}

function equal(a: string, b: string): boolean {
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
const random = () => randomBytes(32).toString("base64url");

export async function startChatgptLogin(redirectUri: string, accountId?: string) {
  const redirect = new URL(redirectUri);
  if (redirect.protocol !== "http:" || redirect.hostname !== "127.0.0.1" || redirect.pathname !== "/api/chatgpt/callback") {
    throw new HttpError(400, "chatgpt_callback", "ChatGPT requires a 127.0.0.1 loopback callback.");
  }
  const { store, account } = await serialized(async () => {
    const store = await loadStore();
    const account = accountId ? store.accounts.find((a) => a.id === accountId) : undefined;
    if (accountId && !account) throw new HttpError(404, "chatgpt_account", "The selected ChatGPT connection wasn't found.");
    await saveStore(store); // Persist the host ID before its first registration.
    return { store, account };
  });
  for (const [key, value] of runtime.transactions) if (value.expiresAt <= Date.now()) runtime.transactions.delete(key);
  const transaction: Transaction = {
    state: random(), browserId: random(), verifier: random(), nonce: random(), redirectUri,
    expiresAt: Date.now() + AUTH_TTL_SECONDS * 1000, account,
  };
  runtime.transactions.set(transaction.state, transaction);
  const url = new URL(`${ISSUER}/api/accounts/authorize`);
  url.search = new URLSearchParams({
    client_id: account?.clientId || "dynamic_agent_client",
    ext_agent_host_id: store.hostId, response_type: "code", redirect_uri: redirectUri, scope: SCOPES,
    resource: RESOURCE, state: transaction.state, nonce: transaction.nonce,
    code_challenge_method: "S256", code_challenge: createHash("sha256").update(transaction.verifier).digest("base64url"),
    ...(account ? {} : { agent_name_hint: "RFQ Parser" }),
    ...(account && !account.tokens ? { prompt: "consent" } : {}),
  }).toString();
  return { url: url.toString(), browserId: transaction.browserId };
}

const Discovery = z.object({ issuer: z.literal(ISSUER), jwks_uri: z.string().url(), revocation_endpoint: z.string().url() });
async function discovery() {
  try {
    const response = await fetch(`${ISSUER}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!response.ok) throw new Error();
    const metadata = Discovery.parse(await response.json());
    for (const endpoint of [metadata.jwks_uri, metadata.revocation_endpoint]) {
      if (new URL(endpoint).origin !== ISSUER) throw new Error();
    }
    return metadata;
  } catch { throw new HttpError(502, "chatgpt_discovery", "Couldn't load ChatGPT sign-in settings. Try again."); }
}

const TokenResponse = z.object({
  access_token: z.string().min(1), refresh_token: z.string().min(1), id_token: z.string().optional(),
  token_type: z.string(), expires_in: z.number().positive(), scope: z.string().optional(),
});
async function exchange(parameters: Record<string, string>) {
  let response: Response;
  try {
    response = await fetch(`${ISSUER}/api/accounts/oauth/token`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(parameters), signal: AbortSignal.timeout(20000), cache: "no-store",
    });
  } catch { throw new HttpError(502, "chatgpt_unreachable", "Couldn't reach ChatGPT sign-in. Try again."); }
  if (!response.ok) {
    throw new HttpError(response.status >= 500 ? 502 : 401, "chatgpt_token_rejected", "ChatGPT rejected the sign-in or refresh. Connect your account again.");
  }
  const parsed = TokenResponse.safeParse(await response.json().catch(() => null));
  if (!parsed.success || parsed.data.token_type.toLowerCase() !== "bearer") {
    throw new HttpError(502, "chatgpt_token_invalid", "ChatGPT returned an incomplete credential response. Connect again.");
  }
  return parsed.data;
}

export async function finishChatgptLogin(callback: URL, browserId: string | undefined) {
  const state = callback.searchParams.get("state") || "";
  const transaction = runtime.transactions.get(state);
  if (!transaction || !browserId || !equal(browserId, transaction.browserId) || transaction.expiresAt <= Date.now()) {
    throw new HttpError(400, "chatgpt_state", "This sign-in expired or doesn't belong to this browser. Start again.");
  }
  runtime.transactions.delete(state); // One-time consumption, including denied or failed attempts.
  if (callback.origin + callback.pathname !== transaction.redirectUri) {
    throw new HttpError(400, "chatgpt_callback", "The sign-in callback doesn't match the original request.");
  }
  if (callback.searchParams.has("error")) throw new HttpError(400, "chatgpt_denied", "ChatGPT sign-in was cancelled or denied.");
  const code = callback.searchParams.get("code");
  const returnedClient = callback.searchParams.get("client_id");
  const clientId = returnedClient || transaction.account?.clientId;
  if (!code || !clientId || clientId === "dynamic_agent_client" || (transaction.account && clientId !== transaction.account.clientId)) {
    throw new HttpError(400, "chatgpt_registration", "ChatGPT registration didn't return the expected client and code. Start again.");
  }
  const tokens = await exchange({ grant_type: "authorization_code", client_id: clientId, code,
    code_verifier: transaction.verifier, redirect_uri: transaction.redirectUri, resource: RESOURCE });
  if (!tokens.id_token) throw new HttpError(502, "chatgpt_identity", "ChatGPT didn't return an identity token.");
  const metadata = await discovery();
  let identity;
  try {
    const verified = await jwtVerify(tokens.id_token, createRemoteJWKSet(new URL(metadata.jwks_uri)), {
      issuer: ISSUER, audience: clientId, requiredClaims: ["sub", "exp", "iat"], clockTolerance: 5,
    });
    identity = verified.payload;
    if (identity.nonce !== transaction.nonce || !identity.sub ||
      (transaction.account && identity.sub !== transaction.account.subject)) throw new Error();
  } catch { throw new HttpError(401, "chatgpt_identity", "Couldn't verify the ChatGPT account. Start sign-in again."); }
  const planAllowed = Boolean(tokens.scope?.split(" ").includes(PLAN_SCOPE));
  await serialized(async () => {
    const store = await loadStore();
    const existing = store.accounts.find((a) => a.clientId === clientId && a.subject === identity.sub);
    const account: AuthAccount = {
      id: existing?.id || randomUUID(), clientId, subject: identity.sub!,
      email: typeof identity.email === "string" ? identity.email : null,
      ...(planAllowed ? { tokens: { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, idToken: tokens.id_token!,
        scope: tokens.scope!, expiresAt: Date.now() + tokens.expires_in * 1000 } } : {}),
    };
    store.accounts = [...store.accounts.filter((a) => a.id !== account.id), account];
    store.activeId = account.id;
    await saveStore(store);
  });
  if (!planAllowed) throw new HttpError(403, "chatgpt_plan_denied", "ChatGPT plan usage wasn't enabled. Connect again and allow plan usage.");
}

export async function chatgptStatus() {
  const store = await loadStore();
  const active = store.accounts.find((a) => a.id === store.activeId);
  return {
    connected: Boolean(active?.tokens), activeId: store.activeId || null,
    accounts: store.accounts.map((a) => ({ id: a.id, email: a.email, connected: Boolean(a.tokens) })),
  };
}

export async function getChatgptAccessToken(): Promise<string> {
  if (process.env.OPENAI_ACCESS_TOKEN) return process.env.OPENAI_ACCESS_TOKEN;
  return serialized(async () => {
    const store = await loadStore();
    const account = store.accounts.find((a) => a.id === store.activeId);
    if (!account?.tokens) throw new HttpError(401, "chatgpt_not_connected", "Connect ChatGPT to parse using your plan.");
    if (account.tokens.expiresAt > Date.now() + 60000) return account.tokens.accessToken;
    let tokens;
    try {
      tokens = await exchange({ grant_type: "refresh_token", client_id: account.clientId,
        refresh_token: account.tokens.refreshToken, resource: RESOURCE });
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) { delete account.tokens; await saveStore(store); }
      throw error;
    }
    const scope = tokens.scope ?? account.tokens.scope;
    if (!scope.split(" ").includes(PLAN_SCOPE)) {
      delete account.tokens; await saveStore(store);
      throw new HttpError(403, "chatgpt_plan_denied", "ChatGPT plan access was removed. Connect your account again.");
    }
    account.tokens = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token,
      idToken: tokens.id_token || account.tokens.idToken, scope, expiresAt: Date.now() + tokens.expires_in * 1000 };
    await saveStore(store);
    return account.tokens.accessToken;
  });
}

export async function selectChatgptAccount(id: string) {
  await serialized(async () => {
    const store = await loadStore();
    if (!store.accounts.some((a) => a.id === id && a.tokens)) throw new HttpError(400, "chatgpt_account", "Connect this ChatGPT account first.");
    store.activeId = id; await saveStore(store);
  });
}

export async function disconnectChatgpt(): Promise<{ revoked: boolean }> {
  return serialized(async () => {
    const store = await loadStore();
    const account = store.accounts.find((a) => a.id === store.activeId);
    let revoked = true;
    if (account?.tokens) {
      try {
        const metadata = await discovery();
        const response = await fetch(metadata.revocation_endpoint, {
          method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: account.tokens.refreshToken, token_type_hint: "refresh_token", client_id: account.clientId }),
          signal: AbortSignal.timeout(15000), cache: "no-store",
        });
        revoked = response.status === 200;
      } catch { revoked = false; }
      delete account.tokens;
    }
    delete store.activeId;
    runtime.transactions.clear();
    await saveStore(store);
    return { revoked };
  });
}
