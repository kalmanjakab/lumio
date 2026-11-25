// Tömeges import: soronként egy kártya, a szó és a jelentés között tabulátor.
export const IMPORT_MAX_LINES = 1000;

export function parseImport(text: string): { cards: { term: string; definition: string }[]; skipped: number; tooMany: boolean } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const cards: { term: string; definition: string }[] = [];
  let skipped = 0;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const tab = raw.indexOf("\t");
    if (tab === -1) {
      skipped++;
      continue;
    }
    const term = raw.slice(0, tab).trim();
    const definition = raw.slice(tab + 1).replace(/\t+/g, " ").trim();
    if (!term || !definition) {
      skipped++;
      continue;
    }
    cards.push({ term: term.slice(0, 1000), definition: definition.slice(0, 2000) });
  }
  return { cards, skipped, tooMany: cards.length > IMPORT_MAX_LINES };
}
