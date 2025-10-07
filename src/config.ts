import { z } from 'zod';
import { Env } from './types';
import * as dotenv from 'dotenv';

dotenv.config();

const EnvSchema = z.object({
  MUNICIPALITY_URL: z
    .string()
    .url()
    .default(
      'https://arianoirpino.trasparenza-valutazione-merito.it/web/trasparenza/albo-pretorio'
    ),
  OPENROUTER_API_KEY: z.string().min(1, 'Missing OPENROUTER_API_KEY'),
  OPENROUTER_MODEL: z.string().default('anthropic/claude-3.5-sonnet'),
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'Missing TELEGRAM_BOT_TOKEN'),
  TELEGRAM_CHAT_ID: z.string().min(1, 'Missing TELEGRAM_CHAT_ID'),
  STATE_BACKEND: z.enum(['file', 'netlify-kv']).default('netlify-kv'),
  STATE_FILE_PATH: z.string().default('.data/state.json'),
  USER_AGENT: z
    .string()
    .default('Mozilla/5.0 (compatible; AlboWatcher/0.1; +https://github.com/)'),
  RATE_LIMIT_RPS: z.coerce.number().default(1),
  TIMEZONE: z.string().default('Europe/Rome'),
});

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data as Env;
}