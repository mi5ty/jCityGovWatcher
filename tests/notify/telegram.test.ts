import { describe, it, expect } from 'vitest';
import { chunkMessage } from '../../src/notify/telegram';

describe('chunkMessage', () => {
  it('splits long text by lines without breaking words', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `riga ${i} con testo`);
    const input = lines.join('\n');
    const parts = chunkMessage(input, 200);
    // Each part must be <= 200
    expect(parts.every((p) => p.length <= 200)).toBe(true);
    // Reconstruct equals original
    expect(parts.join('\n')).toBe(input);
  });

  it('handles single short message', () => {
    const input = 'ciao';
    const parts = chunkMessage(input, 50);
    expect(parts).toEqual(['ciao']);
  });
});
