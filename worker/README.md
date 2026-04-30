# wyattdave-chatbot (Cloudflare Worker)

A small Cloudflare Worker that backs the "Ask a chatbot" panel on the portfolio
site. It calls an OpenRouter free-tier model, augments the prompt with a list
of recent dev.to articles, and exposes a single tool the model can call to
fetch a full article body when the listing is not enough.

When the site sends `clientTools: true`, the Worker returns model tool calls to
the browser instead of executing them server-side. The portfolio page uses that
mode for `get_devto_article` so the browser can fetch dev.to directly and avoid
Worker-origin 403s from the article endpoint.

The Worker also applies a first-turn routing rule for article-content questions:
if the latest user message is asking about what David wrote, argued,
recommended, or said in an article, it forces a Dev.to tool call instead of
letting the model answer from base knowledge.

## Files

- [src/index.js](src/index.js) — Worker entry point, CORS, tool loop.
- [prompt.md](prompt.md) — System prompt, bundled as a text module via
  `wrangler.toml` `rules`.
- [wrangler.toml](wrangler.toml) — Vars + bundling config.

## Environment

Set in `wrangler.toml` under `[vars]` (or `[env.production.vars]`):

| Var                | Purpose                                                         |
| ------------------ | --------------------------------------------------------------- |
| `ALLOWED_ORIGINS`  | Comma-separated CORS allow-list. Add localhost during dev.      |
| `OPENROUTER_MODEL` | Any OpenRouter free model id, e.g. `…:free`.                    |
| `DEVTO_USERNAME`   | Username whose articles seed the prompt context (default `wyattdave`). |
| `SITE_URL`         | Sent as `HTTP-Referer` to OpenRouter (analytics).               |
| `SITE_TITLE`       | Sent as `X-Title` to OpenRouter (analytics).                    |

Secret (never in source):

| Secret               | Source                          |
| -------------------- | ------------------------------- |
| `OPENROUTER_API_KEY` | Azure Key Vault `wyattdave/openrouter` |

Pipe the Key Vault secret straight into Wrangler:

```powershell
az keyvault secret show --vault-name wyattdave --name openrouter --query value -o tsv `
    | wrangler secret put OPENROUTER_API_KEY
```

For production:

```powershell
az keyvault secret show --vault-name wyattdave --name openrouter --query value -o tsv `
    | wrangler secret put OPENROUTER_API_KEY --env production
```

## Run locally

```powershell
cd worker
npm install
npm run dev
```

Then `POST http://127.0.0.1:8787/chat` with:

```json
{
    "messages": [
        { "role": "user", "content": "What has David written about Code Apps?" }
    ]
}
```

The site (any origin in `ALLOWED_ORIGINS`) calls the same endpoint from the
chatbot panel.

## Deploy

```powershell
npm run deploy:prod
```

## Notes

- The article list is cached in-Worker for 5 minutes per username to keep
  latency and dev.to load down.
- Tool loop is capped at 3 hops to avoid runaway calls.
- CORS only echoes back origins explicitly listed in `ALLOWED_ORIGINS`.
