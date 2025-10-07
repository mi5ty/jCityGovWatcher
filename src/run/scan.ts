import { DateTime } from 'luxon';
import { loadEnv } from '../config';
import { AlboItem, Env, StateStore } from '../types';
import { FileStateStore } from '../state/fileStore';
import { NetlifyKvStateStore } from '../state/netlifyKv';
import { scrapeListing, enrichDetail } from '../scrapers/jcitygov';
import { summarizeItems } from '../ai/openrouter';
import { sendTelegram } from '../notify/telegram';

function pickStore(env: Env): StateStore {
  if (env.STATE_BACKEND === 'netlify-kv') return new NetlifyKvStateStore();
  return new FileStateStore(env.STATE_FILE_PATH);
}

function withinAllowedHours(env: Env): boolean {
  const now = DateTime.now().setZone(env.TIMEZONE);
  const hour = now.hour; // 0-23
  return hour >= 8 && hour <= 20; // inclusive 20
}

async function mapWithLimit<T, R>(arr: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  const workers = new Array(Math.min(limit, arr.length)).fill(0).map(async () => {
    while (i < arr.length) {
      const idx = i++;
      results[idx] = await fn(arr[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function scanOnce(opts?: { force?: boolean; ignoreSeen?: boolean }): Promise<{ newItems: AlboItem[]; total: number }> {
  const env = loadEnv();
  const force = !!opts?.force;
  const ignoreSeen = !!opts?.ignoreSeen;

  const store = pickStore(env);
  const seen = ignoreSeen ? new Set<string>() : await store.getSeenIds();

  const items = await scrapeListing(env.MUNICIPALITY_URL, env.USER_AGENT);
  const newItemsPre = items.filter((i) => !seen.has(i.id));

  if (!force && !withinAllowedHours(env)) {
    // Outside allowed hours: do not notify and do not advance state,
    // so that items are reported at the next allowed window.
    return { newItems: [], total: items.length };
  }

  if (newItemsPre.length === 0) return { newItems: [], total: items.length };

  const enriched = await mapWithLimit(newItemsPre, 3, async (i) => enrichDetail(i, env.USER_AGENT));

  // Cap the number of items in the AI prompt to avoid token bloat
  const summarizeSample = enriched.slice(0, 20);
  const summary = await summarizeItems(env, summarizeSample);

  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
  if (!dryRun) {
    await sendTelegram(env, summary, enriched);
  }

  if (!ignoreSeen) {
    await store.addSeenIds(enriched.map((i) => i.id));
  }

  return { newItems: enriched, total: items.length };
}
