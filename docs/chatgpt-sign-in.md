# Parsing with a ChatGPT plan

RFQ Parser can run extraction on your own ChatGPT plan instead of an API key. This is a local, single-user option. The sign-in card only appears when no AI provider is set up; once one is, click the model chip in the header to manage it.

1. Run `npm run dev` and open `http://127.0.0.1:3000`.
2. Click **Continue with ChatGPT**, sign in, and allow RFQ Parser to use your ChatGPT plan. Opening the app on `localhost` also works; sign-in first redirects to `127.0.0.1` so its callback and browser cookie use the same host.
3. After the browser returns, the app displays **Using your ChatGPT plan**. Upload a document or paste an RFQ. The normal extraction schema, normalization, validation, and Nox submission flow apply.
4. Use the account selector to add, reconnect, or switch accounts. **Manage usage** opens ChatGPT usage settings. **Disconnect** attempts to revoke the renewable session, clears its local tokens, and retains the account/client mapping for later sign-in. If remote revocation can't be confirmed, the UI says so.

No partner API key or client secret is needed for this local personal-project flow. RFQ Parser registers its own OAuth client and persists a stable host ID. It requests `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`, uses PKCE/state/nonce, verifies ID-token signatures and claims, and checks plan permission before inference. It keeps each account's client ID and tokens separate; refreshes are serialized and replacement credentials are written atomically with file mode `0600` in a directory with mode `0700`.

Tokens stay on the Node server and are never returned to browser JavaScript or API status responses. **Do not paste a cached Codex login token into source code**; this app needs its own ChatGPT plan authorization. For a manually provisioned app token, use the server-only `OPENAI_ACCESS_TOKEN` variable. It cannot be disconnected through the UI, and RFQ Parser doesn't refresh it.

The dev and production scripts bind to loopback. ChatGPT authentication routes and plan-backed parsing reject remote hosts; account mutations and plan parsing also require the app's same-origin `Origin` header. This is a single-user local app, not a hosted multi-user authentication service. Use a separate credential directory for each installation/process. Moving it into a paid or remotely hosted product requires reviewing the available integration and a different session/storage design.

The official [Sign in with ChatGPT guide](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) documents eligibility and registration. [Plan-backed inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) uses `POST https://api.openai.com/v1/responses` with a bearer access token, `store: false`, and `stream: true`. Requests consume existing ChatGPT plan usage; they don't provide a separate allowance or access to past ChatGPT conversations. PDFs and images are sent inline, and spreadsheets are converted to text locally.

For API-key access instead, set `OPENAI_API_KEY` in `.env.local` and optionally `LLM_PROVIDER=openai`. For Claude, set `ANTHROPIC_API_KEY` and optionally `LLM_PROVIDER=claude`. `MOCK_LLM=1` continues to bypass all model calls.
