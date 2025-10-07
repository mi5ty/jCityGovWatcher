import type { Handler } from '@netlify/functions';
import { connectLambda } from '@netlify/blobs';
import { scanOnce } from '../../src/run/scan';

export const handler: Handler = async (event) => {
  try {
    // Configure Netlify Blobs context for KV access
    connectLambda(event as any);
    const url = new URL(event.rawUrl || 'http://local/scan');
    const force = url.searchParams.get('force') === '1' || url.searchParams.get('force') === 'true';
    const ignoreSeen = url.searchParams.get('ignoreSeen') === '1' || url.searchParams.get('ignoreSeen') === 'true';

    const res = await scanOnce({ force, ignoreSeen });
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, new: res.newItems.length, total: res.total }),
    };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e?.message || String(e) }) };
  }
};
