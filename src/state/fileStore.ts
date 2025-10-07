import { promises as fs } from 'fs';
import { dirname } from 'path';
import { StateStore } from '../types';

export class FileStateStore implements StateStore {
  constructor(private path: string) {}

  async getSeenIds(): Promise<Set<string>> {
    try {
      const data = await fs.readFile(this.path, 'utf-8');
      const json = JSON.parse(data) as { seenIds: string[] };
      return new Set(json.seenIds || []);
    } catch (e: any) {
      if (e.code === 'ENOENT') return new Set();
      throw e;
    }
  }

  async addSeenIds(ids: string[]): Promise<void> {
    const current = await this.getSeenIds();
    ids.forEach((id) => current.add(id));
    const out = JSON.stringify({ seenIds: Array.from(current) }, null, 2);
    await fs.mkdir(dirname(this.path), { recursive: true });
    await fs.writeFile(this.path, out, 'utf-8');
  }
}
