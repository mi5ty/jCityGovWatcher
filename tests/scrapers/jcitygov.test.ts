import { describe, it, expect, vi } from 'vitest';

// mock undici before importing the module under test
const HTML = `
<html><body>
  <table class="master-detail-list-table">
    <tr class="master-detail-list-line" data-id="2025-123">
      <td>2025/123</td>
      <td>DETERMINA</td>
      <td>Oggetto di prova</td>
      <td>01/10/2025 18/10/2025</td>
      <td><a title="Dettaglio" href="/detail/1">Dettaglio</a></td>
    </tr>
  </table>
</body></html>`;

vi.mock('undici', () => ({
  request: async () => ({
    statusCode: 200,
    body: {
      text: async () => HTML,
      json: async () => ({}),
    },
  }),
}));

const { scrapeListing } = await import('../../src/scrapers/jcitygov');

// We test the table parsing helper indirectly by injecting known HTML via a data URL handled by undici

// Any URL will do since undici is mocked
const dataUrl = 'http://example.test/list';

describe('scrapeListing (popup table)', () => {
  it('parses rows and normalizes fields', async () => {
    const items = await scrapeListing(dataUrl, 'test-agent');
    expect(items).toHaveLength(1);
    const i = items[0];
    expect(i.id).toBe('2025-123');
    expect(i.category).toBe('DETERMINA');
    expect(i.subject).toContain('prova');
    expect(i.dateStart).toBe('2025-10-01');
    expect(i.dateEnd).toBe('2025-10-18');
    expect(i.detailUrl).toContain('/detail/1');
  });
});
