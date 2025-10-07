import { describe, it, expect, vi } from 'vitest';

const PAGE1 = `
<html><body>
  <table class="master-detail-list-table">
    <tr class="master-detail-list-line" data-id="2025-001">
      <td>2025/001</td>
      <td>DELIBERA</td>
      <td>Atto pagina 1</td>
      <td>01/10/2025 10/10/2025</td>
      <td><a title="Dettaglio" href="/detail/1">Dettaglio</a></td>
    </tr>
  </table>
  <a rel="next" href="/list?page=2">Next</a>
</body></html>`;

const PAGE2 = `
<html><body>
  <table class="master-detail-list-table">
    <tr class="master-detail-list-line" data-id="2025-002">
      <td>2025/002</td>
      <td>DETERMINA</td>
      <td>Atto pagina 2</td>
      <td>02/10/2025 12/10/2025</td>
      <td><a title="Dettaglio" href="/detail/2">Dettaglio</a></td>
    </tr>
  </table>
</body></html>`;

vi.mock('undici', () => ({
  request: async (url: string) => {
    const u = String(url);
    if (u.includes('page=2')) {
      return {
        statusCode: 200,
        body: { text: async () => PAGE2, json: async () => ({}) },
      } as any;
    }
    return {
      statusCode: 200,
      body: { text: async () => PAGE1, json: async () => ({}) },
    } as any;
  },
}));

const { scrapeListing } = await import('../../src/scrapers/jcitygov');

describe('scrapeListing pagination', () => {
  it('follows rel=next and aggregates items across pages', async () => {
    const items = await scrapeListing('http://example.test/list', 'ua');
    expect(items.map((i) => i.id)).toEqual(['2025-001', '2025-002']);
    expect(items).toHaveLength(2);
  });
});
