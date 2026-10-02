import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalRequest, chatgptStatus, disconnectChatgpt, finishChatgptLogin, getChatgptAccessToken, selectChatgptAccount, startChatgptLogin } from "@/lib/chatgpt-auth";

const keys = vi.hoisted(() => ({ jwks: {} as { keys?: unknown[] } }));
vi.mock("jose", async (importOriginal) => {
  const original = await importOriginal<typeof import("jose")>();
  return { ...original, createRemoteJWKSet: () => original.createLocalJWKSet(keys.jwks as Parameters<typeof original.createLocalJWKSet>[0]) };
});

const CALLBACK = "http://127.0.0.1:3000/api/chatgpt/callback";
const ISSUER = "https://auth.openai.com";
let directory: string;
let pair: Awaited<ReturnType<typeof generateKeyPair>>;
let fetchMock: ReturnType<typeof vi.fn>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const readStore = async () => JSON.parse(await readFile(join(directory, "accounts.json"), "utf8"));
const writeStore = async (store: unknown) => writeFile(join(directory, "accounts.json"), JSON.stringify(store));

async function authorize(options: { subject?: string; scope?: string; nonce?: string; audience?: string; issuer?: string; account?: string; expires?: string } = {}) {
  const login = await startChatgptLogin(CALLBACK, options.account);
  const params = new URL(login.url).searchParams;
  const clientId = params.get("client_id") === "dynamic_agent_client" ? `client_${options.subject || "buyer"}` : params.get("client_id")!;
  const idToken = await new SignJWT({ nonce: options.nonce ?? params.get("nonce"), email: "buyer@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "test" }).setSubject(options.subject || "buyer")
    .setIssuer(options.issuer || ISSUER).setAudience(options.audience || clientId).setIssuedAt().setExpirationTime(options.expires || "1h").sign(pair.privateKey);
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith("openid-configuration")) return json({ issuer: ISSUER, jwks_uri: `${ISSUER}/.well-known/jwks.json`, revocation_endpoint: `${ISSUER}/revoke` });
    if (String(url).endsWith("/revoke")) return new Response(null, { status: 200 });
    expect(init?.method).toBe("POST");
    return json({ access_token: "fake-access", refresh_token: "fake-refresh", id_token: idToken,
      token_type: "Bearer", expires_in: 3600, scope: options.scope ?? "openid offline_access resource.invoke chatgpt.tokens.use.direct" });
  });
  const callback = new URL(CALLBACK);
  callback.search = new URLSearchParams({ state: params.get("state")!, code: "fake-code", client_id: clientId }).toString();
  return { login, callback, params, clientId };
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "rfq-chatgpt-"));
  vi.stubEnv("CHATGPT_AUTH_DIR", directory); vi.stubEnv("OPENAI_ACCESS_TOKEN", "");
  pair = await generateKeyPair("RS256");
  keys.jwks = { keys: [{ ...await exportJWK(pair.publicKey), kid: "test", alg: "RS256" }] };
  fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
});
afterEach(async () => {
  vi.unstubAllEnvs(); vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});

describe("ChatGPT OAuth", () => {
  it("uses fresh PKCE and stores credentials privately without exposing tokens in status", async () => {
    const { login, callback, params, clientId } = await authorize();
    expect(params.get("client_id")).toBe("dynamic_agent_client");
    expect(params.get("scope")).toContain("chatgpt.tokens.use.direct");
    expect(params.get("resource")).toBe("https://api.openai.com/v1");
    expect(params.get("agent_name_hint")).toBe("RFQ Parser");
    await finishChatgptLogin(callback, login.browserId);
    const tokenCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("oauth/token"))!;
    const body = tokenCall[1].body as URLSearchParams;
    expect(body.get("client_id")).toBe(clientId);
    expect(createHash("sha256").update(body.get("code_verifier")!).digest("base64url")).toBe(params.get("code_challenge"));
    expect((await stat(join(directory, "accounts.json"))).mode & 0o777).toBe(0o600);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    const status = await chatgptStatus();
    expect(status.connected).toBe(true);
    expect(status.accounts[0].email).toBe("buyer@example.com");
    expect(JSON.stringify(status)).not.toMatch(/fake-access|fake-refresh|idToken|clientId|subject/);
    await expect(finishChatgptLogin(callback, login.browserId)).rejects.toMatchObject({ code: "chatgpt_state" });
  });

  it("rejects wrong browser, expired state and callbacks at a different origin", async () => {
    const { login, callback } = await authorize();
    await expect(finishChatgptLogin(callback, "other-browser")).rejects.toMatchObject({ code: "chatgpt_state" });
    const elsewhere = new URL(callback); elsewhere.port = "4000";
    await expect(finishChatgptLogin(elsewhere, login.browserId)).rejects.toMatchObject({ code: "chatgpt_callback" });
    expect(fetchMock).not.toHaveBeenCalled();
    const next = await authorize();
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 601000);
    await expect(finishChatgptLogin(next.callback, next.login.browserId)).rejects.toMatchObject({ code: "chatgpt_state" });
    now.mockRestore();
  });

  it.each([
    { nonce: "wrong" }, { audience: "wrong" }, { issuer: "https://example.com" }, { expires: "-1h" },
  ])("rejects invalid identity claims %j", async (options) => {
    const { login, callback } = await authorize(options);
    await expect(finishChatgptLogin(callback, login.browserId)).rejects.toMatchObject({ code: "chatgpt_identity" });
    expect((await chatgptStatus()).connected).toBe(false);
  });

  it("rejects a signature from an unknown signing key", async () => {
    const { login, callback } = await authorize();
    keys.jwks = { keys: [] };
    await expect(finishChatgptLogin(callback, login.browserId)).rejects.toMatchObject({ code: "chatgpt_identity" });
  });

  it("retains registration without inference credentials when plan scope is declined", async () => {
    const { login, callback, clientId, params } = await authorize({ scope: "openid email" });
    await expect(finishChatgptLogin(callback, login.browserId)).rejects.toMatchObject({ code: "chatgpt_plan_denied" });
    const status = await chatgptStatus();
    expect(status.connected).toBe(false);
    const returning = new URL((await startChatgptLogin(CALLBACK, status.accounts[0].id)).url).searchParams;
    expect(returning.get("client_id")).toBe(clientId);
    expect(returning.get("ext_agent_host_id")).toBe(params.get("ext_agent_host_id"));
    expect(returning.has("agent_name_hint")).toBe(false);
    expect(returning.get("prompt")).toBe("consent");
  });

  it("does not exchange denied authorization and consumes its state", async () => {
    const { login, callback } = await authorize();
    callback.searchParams.set("error", "access_denied");
    await expect(finishChatgptLogin(callback, login.browserId)).rejects.toMatchObject({ code: "chatgpt_denied" });
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(finishChatgptLogin(callback, login.browserId)).rejects.toMatchObject({ code: "chatgpt_state" });
  });

  it("serializes refreshes, rotates tokens, and retains the issued client ID", async () => {
    const { login, callback, clientId } = await authorize();
    await finishChatgptLogin(callback, login.browserId);
    const store = await readStore(); store.accounts[0].tokens.expiresAt = 0; await writeStore(store);
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(json({ access_token: "replacement-access", refresh_token: "replacement-refresh", token_type: "Bearer", expires_in: 3600 }));
    const result = await Promise.all([getChatgptAccessToken(), getChatgptAccessToken()]);
    expect(result).toEqual(["replacement-access", "replacement-access"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].body.get("client_id")).toBe(clientId);
    expect(fetchMock.mock.calls[0][1].body.has("scope")).toBe(false);
    expect((await readStore()).accounts[0].tokens.refreshToken).toBe("replacement-refresh");
  });

  it("clears rejected refresh credentials but keeps them after temporary network failure", async () => {
    const { login, callback } = await authorize(); await finishChatgptLogin(callback, login.browserId);
    const store = await readStore(); store.accounts[0].tokens.expiresAt = 0; await writeStore(store);
    fetchMock.mockRejectedValue(new Error("network secret"));
    await expect(getChatgptAccessToken()).rejects.toMatchObject({ code: "chatgpt_unreachable" });
    expect((await chatgptStatus()).connected).toBe(true);
    fetchMock.mockResolvedValue(json({ error: "invalid_grant" }, 400));
    await expect(getChatgptAccessToken()).rejects.toMatchObject({ code: "chatgpt_token_rejected" });
    expect((await chatgptStatus()).connected).toBe(false);
  });

  it("keeps accounts separate and rejects a returning sign-in for another subject", async () => {
    const first = await authorize(); await finishChatgptLogin(first.callback, first.login.browserId);
    const id = (await chatgptStatus()).activeId!;
    const second = await authorize({ subject: "second" }); await finishChatgptLogin(second.callback, second.login.browserId);
    expect((await chatgptStatus()).accounts).toHaveLength(2);
    await selectChatgptAccount(id); expect((await chatgptStatus()).activeId).toBe(id);
    const mismatch = await authorize({ account: id, subject: "other" });
    await expect(finishChatgptLogin(mismatch.callback, mismatch.login.browserId)).rejects.toMatchObject({ code: "chatgpt_identity" });
    expect((await chatgptStatus()).activeId).toBe(id);
  });

  it("revokes before disconnect and retains registration for another sign-in", async () => {
    const { login, callback, clientId } = await authorize(); await finishChatgptLogin(callback, login.browserId);
    fetchMock.mockClear();
    expect(await disconnectChatgpt()).toEqual({ revoked: true });
    const revoke = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/revoke"))!;
    expect(revoke[1].body.get("token")).toBe("fake-refresh");
    expect(revoke[1].body.get("client_id")).toBe(clientId);
    const status = await chatgptStatus();
    expect(status.connected).toBe(false); expect(status.accounts).toHaveLength(1);
    expect((await readStore()).accounts[0].tokens).toBeUndefined();
  });

  it("reports unconfirmed remote revocation while clearing local secrets", async () => {
    const { login, callback } = await authorize(); await finishChatgptLogin(callback, login.browserId);
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await disconnectChatgpt()).toEqual({ revoked: false });
    expect((await chatgptStatus()).connected).toBe(false);
  });

  it("blocks remote hosts and cross-origin mutations", () => {
    expect(() => assertLocalRequest(new Request("http://evil.example/api/chatgpt/session"))).toThrow("local app only");
    expect(() => assertLocalRequest(new Request("http://127.0.0.1:3000/api/chatgpt/session", { headers: { origin: "http://evil.example" } }), true)).toThrow("local app");
    expect(assertLocalRequest(new Request("http://127.0.0.1:3000/api/chatgpt/session", { headers: { origin: "http://127.0.0.1:3000" } }), true).hostname).toBe("127.0.0.1");
  });

  it("preserves the real loopback Host when NextRequest normalizes its URL", async () => {
    const { NextRequest } = await import("next/server");
    const request = new NextRequest("http://127.0.0.1:3000/api/chatgpt/session", {
      headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
    });
    expect(assertLocalRequest(request, true).origin).toBe("http://127.0.0.1:3000");
    const { GET } = await import("@/app/api/chatgpt/login/route");
    const result = await GET(new NextRequest("http://127.0.0.1:3000/api/chatgpt/login", { headers: { host: "127.0.0.1:3000" } }));
    expect(new URL(result.headers.get("location")!).hostname).toBe("auth.openai.com");
    expect(result.headers.get("set-cookie")).toContain("HttpOnly");
    expect(() => assertLocalRequest(new Request("http://localhost:3000/api/chatgpt/session", { headers: { host: "evil.example" } }))).toThrow("local app only");
  });
});
