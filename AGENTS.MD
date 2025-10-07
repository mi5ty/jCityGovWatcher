# Agents Guide

This document explains how AI agents interact with this project to reliably scan municipal “Albo Pretorio” portals, summarize new publications via OpenRouter, and notify a Telegram channel. It captures the roles, inputs/outputs, guardrails, and operational conventions tailored to this repository.

## Overview

- Language/Stack: Node.js 18+, TypeScript
- Entry points:
  - CLI: `npm run scan` (respects DRY_RUN)
  - Netlify Scheduled Function: configured in `netlify.toml` to invoke the scan hourly
- Core modules:
  - Scraper: `src/scrapers/jcitygov.ts`
  - AI summarizer: `src/ai/openrouter.ts`
  - Notifier: `src/notify/telegram.ts`
  - State: `src/state/*` (Netlify KV or file-based)
  - Orchestrator: `src/run/scan.ts`

The typical agent flow is: fetch listing → filter unseen → enrich each item → summarize (OpenRouter) → optionally send Telegram → persist seen IDs.

## Agent Roles

1) Scan Orchestrator
   - Location: `src/run/scan.ts` (`scanOnce`)
   - Responsibilities:
     - Load env via `src/config.ts`
     - Choose state backend (`file` vs `netlify-kv`)
     - Enforce quiet hours (08:00–20:00 Europe/Rome)
     - Coordinate scraping, enrichment, summarization, and notification

2) Scraper Agent
   - Location: `src/scrapers/jcitygov.ts`
   - Responsibilities:
     - Retrieve listing HTML (with retries and UA)
     - Parse jCityGov/Liferay table rows into `AlboItem[]`
     - Resolve detail URLs and basic metadata (year/number/type/subject/dates)
     - Enrich detail page with better subject/type and attachments

3) Summarizer Agent
   - Location: `src/ai/openrouter.ts`
   - Responsibilities:
     - Build a compact, Italian summary highlighting type/category, subject, period and notable attachments
     - Use OpenRouter Chat Completions API with `OPENROUTER_MODEL`
     - Temperature: 0.2, max_tokens: 500 (tuned for short bullet summaries)

4) Notifier Agent
   - Location: `src/notify/telegram.ts`
   - Responsibilities:
     - Format messages in Telegram MarkdownV2 (with proper escaping)
     - Chunk messages to respect Telegram size limits
     - POST to Telegram Bot API using `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`

5) State Agent
   - Location: `src/state/fileStore.ts`, `src/state/netlifyKv.ts`
   - Responsibilities:
     - Get and persist `seenIds` to ensure idempotent notifications

## Environment & Configuration

Environment variables are validated by `src/config.ts` (zod). Minimum set:

- `OPENROUTER_API_KEY` (required)
- `TELEGRAM_BOT_TOKEN` (required)
- `TELEGRAM_CHAT_ID` (required)
- `OPENROUTER_MODEL` (default: `anthropic/claude-3.5-sonnet`)
- `MUNICIPALITY_URL` (default: Ariano Irpino portal)
- `STATE_BACKEND` (`file` | `netlify-kv`, default `netlify-kv`)
- `STATE_FILE_PATH` (default `.data/state.json`)
- `USER_AGENT` (default robot UA)
- `RATE_LIMIT_RPS` (not currently used directly in code; reserved)
- `TIMEZONE` (default `Europe/Rome`)

Note: Quiet hours are enforced in code; outside 08:00–20:00 no notifications are sent and state does not advance.

## Inputs and Outputs

- Input: municipal listing page HTML (jCityGov/Liferay)
- Input: environment variables listed above
- Output: Telegram messages (MarkdownV2) containing header, optional summary, and bullet list of items with dates and detail link
- Output: updated state with merged `seenIds`

## Operational Modes

- Dry run: set `DRY_RUN=1` to execute the whole flow but skip Telegram sends; state still advances after enrichment/summarization
- Netlify: run via Scheduled Functions (cron in `netlify.toml`); state uses Netlify KV by default
- Local CLI: `npm run scan` or `DRY_RUN=1 npm run scan`

## Guardrails for AI Agents

- Never include secrets in logs, commits, or prompts. Keys must come from env and must not be printed.
- Respect MarkdownV2 escaping when composing Telegram text. Use `escapeMarkdownV2` utility in `src/notify/telegram.ts`.
- Limit summarization payload to avoid token bloat; current cap: first 20 enriched items.
- Keep OpenRouter headers: `Authorization`, `HTTP-Referer`, and `X-Title` as implemented.
- Network requests should use `undici` and retries (p-retry) where applicable.
- Do not alter state outside allowed hours.

## Extending Agents

- Adding a new municipality or portal type:
  - Add a new scraper module in `src/scrapers/*` with the same `AlboItem` shape
  - Wire it in `scan.ts` (swap `scrapeListing` implementation or detect by URL)

- Changing summarization model:
  - Set `OPENROUTER_MODEL` in env; code strips optional `openrouter/` prefix automatically

- Alternative notifiers:
  - Add `src/notify/<channel>.ts` with a `send(env, summary, items)` signature and plug it in `scan.ts`

## Local Development Checklist for Agents

1. Install deps with a frozen lockfile: `npm ci`
2. Type check: `npm run typecheck`
3. Build: `npm run build`
4. Test: `npm test`
5. Run locally in dry-run: `DRY_RUN=1 npm run scan`

## Error Handling & Observability

- HTTP errors from OpenRouter and Telegram are surfaced with status code and body text; let them fail fast in CI/local runs.
- Scraper fetch uses retry logic; tailor retry/backoff in `src/scrapers/jcitygov.ts` if needed.
- Consider adding structured logs if moving to production scale.

## Data Model Reference (`AlboItem`)

Source of truth: `src/types.ts`

```
type AlboItem = {
  id: string;
  year?: string;
  number?: string;
  category?: string;
  type?: string;
  subject?: string;
  dateStart?: string; // ISO YYYY-MM-DD
  dateEnd?: string;   // ISO YYYY-MM-DD
  detailUrl: string;
  attachments: { name?: string; url: string; size?: string }[];
  raw?: Record<string, string | undefined>;
}
```

## Security Notes

- Do not commit `.env` or any secrets. Use environment variables locally and on Netlify. The repo already ignores typical environment and build artifacts.
- Review diffs for accidental key leaks before committing or opening PRs.

## FAQ

- Why were messages missing during the night? The orchestrator enforces quiet hours; items will be sent the next allowed window without advancing state beforehand.
- Can I switch to file state locally? Yes: set `STATE_BACKEND=file` and optionally adjust `STATE_FILE_PATH`.
- How do I change the summary style? Adjust prompts in `src/ai/openrouter.ts` (system/user messages) and tune model/temperature.
