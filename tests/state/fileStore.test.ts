import { describe, it, expect, beforeEach } from 'vitest';
import { FileStateStore } from '../../src/state/fileStore';
import { promises as fs } from 'fs';
import { dirname } from 'path';

const TMP = '.tmp-tests/state.json';

describe('FileStateStore', () => {
  beforeEach(async () => {
    try {
      await fs.rm(dirname(TMP), { recursive: true, force: true });
    } catch {}
  });

  it('returns empty set when file missing', async () => {
    const store = new FileStateStore(TMP);
    const seen = await store.getSeenIds();
    expect(seen.size).toBe(0);
  });

  it('persists and merges ids', async () => {
    const store = new FileStateStore(TMP);
    await store.addSeenIds(['a', 'b']);
    await store.addSeenIds(['b', 'c']);
    const seen = await store.getSeenIds();
    expect(seen.has('a')).toBe(true);
    expect(seen.has('b')).toBe(true);
    expect(seen.has('c')).toBe(true);
    // file exists
    const data = JSON.parse(await fs.readFile(TMP, 'utf-8'));
    expect(Array.isArray(data.seenIds)).toBe(true);
  });
});
