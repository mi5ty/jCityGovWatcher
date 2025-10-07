import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as config from '../../src/config';
import * as stateFile from '../../src/state/fileStore';
import * as jcity from '../../src/scrapers/jcitygov';
import * as ai from '../../src/ai/openrouter';
import * as tg from '../../src/notify/telegram';
import { scanOnce } from '../../src/run/scan';

describe('scanOnce', () => {
  const env = {
    MUNICIPALITY_URL: 'http://example/list',
    OPENROUTER_API_KEY: 'k',
    OPENROUTER_MODEL: 'test/model',
    TELEGRAM_BOT_TOKEN: 't',
    TELEGRAM_CHAT_ID: 'c',
    STATE_BACKEND: 'file' as const,
    STATE_FILE_PATH: '.tmp-tests/state.json',
    USER_AGENT: 'ua',
    RATE_LIMIT_RPS: 1,
    TIMEZONE: 'Europe/Rome',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(config, 'loadEnv').mockReturnValue(env);
  });

  it('returns early outside allowed hours without advancing state (unless forced)', async () => {
    // Force withinAllowedHours to return false by mocking Date
    const RealDate = Date;
    // mock 02:00
    vi.setSystemTime(new Date('2025-10-04T02:00:00+02:00'));

    vi.spyOn(stateFile.FileStateStore.prototype, 'getSeenIds').mockResolvedValue(new Set());
    vi.spyOn(jcity, 'scrapeListing').mockResolvedValue([
      { id: '1', detailUrl: 'http://d', attachments: [] },
    ] as any);

    const res = await scanOnce();
    expect(res.newItems.length).toBe(0);
    expect(res.total).toBe(1);

    // Forced run should bypass quiet hours
    // Mock downstream to avoid network during forced run
    vi.spyOn(jcity, 'enrichDetail').mockImplementation(async (i) => ({ ...i, subject: 'S' } as any));
    vi.spyOn(ai, 'summarizeItems').mockResolvedValue('summary');
    vi.spyOn(tg, 'sendTelegram').mockResolvedValue();
    const res2 = await scanOnce({ force: true });
    expect(res2.total).toBe(1);
  });

  it('enriches, summarizes, sends, and persists when there are new items', async () => {
    // mock 10:00
    vi.setSystemTime(new Date('2025-10-04T10:00:00+02:00'));

    const seen = new Set<string>(['old']);
    vi.spyOn(stateFile.FileStateStore.prototype, 'getSeenIds').mockResolvedValue(seen);
    vi.spyOn(jcity, 'scrapeListing').mockResolvedValue([
      { id: 'new1', detailUrl: 'http://d1', attachments: [] },
      { id: 'old', detailUrl: 'http://d2', attachments: [] },
    ] as any);
    vi.spyOn(jcity, 'enrichDetail').mockImplementation(async (i) => ({ ...i, subject: 'S' } as any));
    vi.spyOn(ai, 'summarizeItems').mockResolvedValue('summary');
    const sendSpy = vi.spyOn(tg, 'sendTelegram').mockResolvedValue();
    const addSpy = vi.spyOn(stateFile.FileStateStore.prototype, 'addSeenIds').mockResolvedValue();

    const res = await scanOnce();
    expect(res.newItems.map((i) => i.id)).toEqual(['new1']);
    expect(sendSpy).toHaveBeenCalledOnce();
    expect(addSpy).toHaveBeenCalledWith(['new1']);

    // With ignoreSeen, both items are considered new and state is not updated
    sendSpy.mockClear();
    addSpy.mockClear();
    const res2 = await scanOnce({ ignoreSeen: true });
    expect(res2.newItems.length).toBe(2);
    expect(addSpy).not.toHaveBeenCalled();
  });
});
