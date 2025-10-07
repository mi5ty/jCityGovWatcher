export type AlboItem = {
  id: string;
  year?: string;
  number?: string;
  category?: string; // e.g., DETERMINAZIONE, DELIBERA DI GIUNTA
  type?: string; // Tipo Atto if different from category
  subject?: string;
  dateStart?: string; // ISO date
  dateEnd?: string; // ISO date
  detailUrl: string;
  attachments: { name?: string; url: string; size?: string }[];
  raw?: Record<string, string | undefined>;
};

export type ScanResult = {
  newItems: AlboItem[];
  totalSeen: number;
};

export interface StateStore {
  getSeenIds(): Promise<Set<string>>;
  addSeenIds(ids: string[]): Promise<void>;
}

export type Env = {
  MUNICIPALITY_URL: string;
  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  STATE_BACKEND: 'file' | 'netlify-kv';
  STATE_FILE_PATH: string;
  USER_AGENT: string;
  RATE_LIMIT_RPS: number;
  TIMEZONE: string;
};