import { request } from 'undici';
import { AlboItem, Env } from '../types';

export async function summarizeItems(env: Env, items: AlboItem[]): Promise<string> {
  const system = `Sei un assistente che riassume le nuove pubblicazioni dell'Albo Pretorio in italiano.
Scrivi un breve riassunto puntato per un pubblico generale. Evidenzia categorie (Determina, Delibera, Ordinanza, Avviso...), oggetti, periodi di pubblicazione e eventuali allegati importanti.
Mantieni un tono conciso e informativo. Evita di inventare dettagli. Evita di includere informazioni sugli allegati se non presenti.`;

  const user = `Riepiloga in 5-8 punti le seguenti pubblicazioni (non ripetere tutte se sono troppe, scegli le più rilevanti e varie):\n\n${items
    .map(
      (i) => `- [${i.category || i.type || 'Atto'}] ${i.subject || '(oggetto non disponibile)'} (${i.dateStart || '?'} → ${
        i.dateEnd || '?'
      })\n  Dettaglio: ${i.detailUrl}\n  Allegati: ${i.attachments.length}`
    )
    .join('\n')}`;

  const model = env.OPENROUTER_MODEL.replace(/^openrouter\//, '');
  const res = await request('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://github.com/',
      'X-Title': 'AlboPretorioWatcher',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      max_tokens: 500,
    }),
  });

  if (res.statusCode >= 400) {
    const text = await res.body.text();
    throw new Error(`OpenRouter error ${res.statusCode}: ${text}`);
  }
  const json = (await res.body.json()) as any;
  const content = json.choices?.[0]?.message?.content?.trim();
  return content || '';
}
