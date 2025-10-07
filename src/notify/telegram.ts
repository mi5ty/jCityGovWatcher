import { request } from 'undici';
import { AlboItem, Env } from '../types';

function escapeMarkdownV2(text: string) {
  return text.replace(/([_*>\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

function formatItem(i: AlboItem) {
  const header = `• [${escapeMarkdownV2(i.category || i.type || 'Atto')}] ${escapeMarkdownV2(
    i.subject || '(oggetto non disponibile)'
  )}`;
  const dates = `${escapeMarkdownV2(i.dateStart || '?')} → ${escapeMarkdownV2(i.dateEnd || '?')}`;
  const detail = `[Dettaglio](${i.detailUrl})`;
  const attach = i.attachments.length ? `Allegati: ${i.attachments.length}` : '';
  return `${header}\n  ${dates}  ${detail}${attach ? `\n  ${escapeMarkdownV2(attach)}` : ''}`;
}

export function chunkMessage(text: string, limit = 3500): string[] {
  const parts: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    if ((current + '\n' + line).length > limit) {
      parts.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function groupByDate(items: AlboItem[]): Map<string, AlboItem[]> {
  const m = new Map<string, AlboItem[]>();
  for (const it of items) {
    const key = it.dateStart || 'Senza data';
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(it);
  }
  // sort groups by date desc (unknown last)
  return new Map(
    Array.from(m.entries()).sort((a, b) => {
      const ax = a[0] === 'Senza data' ? '' : a[0];
      const bx = b[0] === 'Senza data' ? '' : b[0];
      return bx.localeCompare(ax);
    })
  );
}

export async function sendTelegram(env: Env, summary: string, items: AlboItem[]) {
  const header = `🗂️ Albo Pretorio – Ultimi aggiornamenti`;
  const byDate = groupByDate(items);
  const sections: string[] = [];
  if (summary) sections.push(`\n${escapeMarkdownV2(summary)}`);
  for (const [date, group] of byDate) {
    const title = date === 'Senza data' ? 'Senza data' : `Pubblicati il ${date}`;
    sections.push(`\n*${escapeMarkdownV2(title)}*`);
    sections.push(...group.map(formatItem));
  }
  const body = sections.filter(Boolean).join('\n');
  const messages = chunkMessage(`*${escapeMarkdownV2(header)}*\n${body}`);

  for (const msg of messages) {
    const res = await request(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: msg,
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
        }),
      }
    );
    if (res.statusCode >= 400) {
      const text = await res.body.text();
      throw new Error(`Telegram error ${res.statusCode}: ${text}`);
    }
  }
}
