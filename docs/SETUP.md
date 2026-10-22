# Setup and operation

## Local demo

Start Docker Desktop, install Node.js 22 or newer, clone the repository, then run:

```sh
npm run bootstrap
npm test
```

Bootstrap generates local secrets only if `.env` does not exist. It does not overwrite an existing configuration. Open `http://localhost:5678` and create the local owner account. The demo is available with `npm run demo` on an isolated installation. Do not run the demo against a live deployment: it resets demo records and imports a test harness.

## Environment variables

Copy `.env.example` only if you are configuring manually. Normally `npm run setup` creates `.env` and generates random values for `POSTGRES_PASSWORD`, `N8N_ENCRYPTION_KEY` and `DEMO_API_KEY`.

| Variable | Meaning |
|---|---|
| `POSTGRES_PASSWORD` | Local database password. |
| `N8N_ENCRYPTION_KEY` | Encrypts n8n credential values; preserve it with backups. |
| `DEMO_API_KEY` | Authenticates the internal adapter and demo endpoints. |
| `TRACKER_MODE` | `demo` or `live`. |
| `PRICE_SOURCE` | `demo`, `scrapingdog` or optional `keepa`. |
| `ALLOWED_CHAT_ID` | Owner’s private Telegram chat; `10001` is reserved for demo. |
| `TELEGRAM_BOT_TOKEN` | Private token from BotFather. |
| `SCRAPINGDOG_API_KEY` | Private price-provider key for the selected live adapter. |
| `KEEPA_API_KEY` | Optional alternative price-provider key. |
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | OpenAI-compatible model connection. The local Ollama setup uses a local-only placeholder key. |
| `WEBHOOK_URL` | Public HTTPS base URL used by the Telegram webhook. |

Never paste actual credential values into committed files, terminal screenshots or demonstration slides. Credential JSON generated under `.runtime/` is private and ignored.

## Live Telegram and price data

1. Create a Telegram bot with BotFather and store the token privately in `.env`.
2. Start a private conversation with the bot. Set `ALLOWED_CHAT_ID` to your private chat ID. `node scripts/connect-telegram.mjs` can discover one `/start` conversation if no webhook is already configured.
3. Add the selected provider key as `SCRAPINGDOG_API_KEY`. Check the provider’s current quota and trial/subscription conditions in its dashboard.
4. Download the local model:

```sh
docker compose up -d ollama
docker compose exec ollama ollama pull qwen2.5:0.5b
```

5. Run:

```sh
node scripts/start-live.mjs
```

This sets live mode with Scrapingdog and local Ollama, renews the temporary HTTPS tunnel, regenerates and imports configured workflows, and publishes the Telegram entry. It briefly restarts n8n. It does not buy a subscription or register products.

6. Check the local n8n credential connections and send `/help` or `/list` from Telegram. Registering a real product and running `/check` consume provider credits. Do not repeat price checks just to inspect their results; open the saved execution instead.

The gateway exposes only the production Telegram webhook path. It rejects missing secret headers and forwards the header for n8n to verify. Other paths return 404. The editor remains bound to localhost. The webhook secret must remain private; do not publish deployment-specific trigger node identifiers or private runtime exports.

## Error handler

Bootstrap publishes `Wishlist | Error Handler`. Existing workflows reference it through `settings.errorWorkflow`. Automatic unhandled failures can send a private Telegram notification with the workflow name, failed node and local execution URL. Error notifications require a valid Telegram credential and the correct owner chat in the generated handler. Demo mode has no real Telegram credential by default.

The handler has no self-reference. Expected invalid-price outcomes, handled delivery failures and model fallbacks use their existing paths. See [reliability notes](RELIABILITY.md).

## Persistence and stopping

```sh
docker compose stop
docker compose start
```

Named volumes preserve n8n configuration, PostgreSQL records and the model. `docker compose down` also preserves named volumes; `docker compose down -v` removes them and erases data. The database has a Compose healthcheck. n8n and the adapter are exposed only on loopback ports 5678 and 8787.

Keep the computer awake for scheduled checks. After sleep or tunnel expiration, renew the endpoint with `node scripts/start-live.mjs` and verify Telegram connectivity. Running `npm run bootstrap` alone deliberately leaves the Telegram entry inactive.

## Repository checks

Enable the included local commit guard:

```sh
git config core.hooksPath .githooks
```

Run `node scripts/check-repository.mjs` after staging changes. The guard detects common token formats and excludes private/runtime files; it cannot replace visual inspection of screenshots or a full credential-management process.
