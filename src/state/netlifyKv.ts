import { getStore } from '@netlify/blobs';
import { StateStore } from '../types';

const STORE = 'jcitygovwatcher';
const KEY = 'seen-ids.json';

export class NetlifyKvStateStore implements StateStore {
  private store = getStore(STORE);

  async getSeenIds(): Promise<Set<string>> {
    const json = (await this.store.get(KEY, { type: 'json' })) as {
      seenIds: string[];
    } | null;
    if (!json) return new Set();
    return new Set(json.seenIds || []);
  }

  async addSeenIds(ids: string[]): Promise<void> {
    const current = await this.getSeenIds();
    ids.forEach((id) => current.add(id));
    await this.store.setJSON(KEY, { seenIds: Array.from(current) });
  }
}
