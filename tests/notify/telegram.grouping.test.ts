import { describe, it, expect, vi } from 'vitest';

// Capture payloads sent to Telegram
const payloads: any[] = [];

vi.mock('undici', () => ({
  request: async (_url: string, init?: any) => {
    try {
      if (init?.body) payloads.push(JSON.parse(init.body));
    } catch {}
    return { statusCode: 200, body: { text: async () => '' } } as any;
  },
}));

import { sendTelegram } from '../../src/notify/telegram';

describe('telegram grouping', () => {
  it('groups items by dateStart in descending order', async () => {
    const env: any = { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: 'c' };
    const items = [
      { id: '1', category: 'A', subject: 'x', dateStart: '2025-10-03', dateEnd: '2025-10-10', detailUrl: 'u1', attachments: [] },
      { id: '2', category: 'B', subject: 'y', dateStart: '2025-10-04', dateEnd: '2025-10-11', detailUrl: 'u2', attachments: [] },
      { id: '3', category: 'C', subject: 'z', dateStart: '2025-10-02', dateEnd: '2025-10-09', detailUrl: 'u3', attachments: [] },
    ] as any;

    payloads.length = 0;
    await sendTelegram(env, '', items);
    expect(payloads.length).toBeGreaterThan(0);
    const text = payloads[0].text as string;
    const plain = text.replace(/\\/g, ''); // ignore MarkdownV2 escaping in expectations
    const firstGroupIdx = plain.indexOf('*Pubblicati il 2025-10-04*');
    const secondGroupIdx = plain.indexOf('*Pubblicati il 2025-10-03*');
    const thirdGroupIdx = plain.indexOf('*Pubblicati il 2025-10-02*');
    expect(firstGroupIdx).toBeGreaterThan(0);
    expect(secondGroupIdx).toBeGreaterThan(firstGroupIdx);
    expect(thirdGroupIdx).toBeGreaterThan(secondGroupIdx);
  });
});
