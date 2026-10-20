type PdfTextTransform = [number, number, number, number, number, number];

export interface PdfTextItemLike {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
}

interface PositionedTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hasEOL: boolean;
}

interface TextLine {
  y: number;
  height: number;
  items: PositionedTextItem[];
}

const DEFAULT_LINE_TOLERANCE = 2.5;

export function reconstructPdfPageText(items: PdfTextItemLike[]): string {
  const positioned = items
    .map(toPositionedItem)
    .filter((item): item is PositionedTextItem => item !== null);

  if (positioned.length === 0) return '';

  const medianHeight = median(positioned.map(item => item.height).filter(height => height > 0));
  const lineTolerance = Math.max(DEFAULT_LINE_TOLERANCE, medianHeight * 0.55);
  const lines = groupIntoLines(positioned, lineTolerance);

  return lines
    .sort((a, b) => b.y - a.y)
    .map(line => renderLine(line))
    .filter(line => line.length > 0)
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function reconstructPdfDocumentText(pageTexts: string[]): string {
  return pageTexts
    .map(text => text.trim())
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toPositionedItem(item: PdfTextItemLike): PositionedTextItem | null {
  const text = normalizePdfText(item.str ?? '');
  if (!text.trim()) return null;

  const transform = Array.isArray(item.transform) && item.transform.length >= 6
    ? item.transform as PdfTextTransform
    : [1, 0, 0, 1, 0, 0];
  const height = Math.max(1, Math.abs(Number(item.height) || Math.abs(transform[3]) || Math.abs(transform[0]) || 1));

  return {
    text,
    x: Number(transform[4]) || 0,
    y: Number(transform[5]) || 0,
    width: Math.max(0, Number(item.width) || estimateTextWidth(text, height)),
    height,
    hasEOL: item.hasEOL === true,
  };
}

function groupIntoLines(items: PositionedTextItem[], tolerance: number): TextLine[] {
  const lines: TextLine[] = [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  for (const item of sorted) {
    const line = lines.find(candidate => Math.abs(candidate.y - item.y) <= tolerance);
    if (line) {
      line.items.push(item);
      line.y = weightedAverage(line.y, line.items.length - 1, item.y);
      line.height = Math.max(line.height, item.height);
      continue;
    }

    lines.push({ y: item.y, height: item.height, items: [item] });
  }

  return lines;
}

function renderLine(line: TextLine): string {
  const items = [...line.items].sort((a, b) => a.x - b.x);
  let output = '';
  let previous: PositionedTextItem | null = null;

  for (const item of items) {
    if (!previous) {
      output += item.text.trimStart();
      previous = item;
      continue;
    }

    const gap = item.x - (previous.x + previous.width);
    if (shouldInsertSpace(output, item.text, gap, averageCharWidth(previous))) {
      output += ' ';
    }

    output += item.text.trimStart();
    previous = item;
  }

  return output
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function shouldInsertSpace(output: string, nextText: string, gap: number, charWidth: number): boolean {
  if (!output || /\s$/.test(output) || /^\s/.test(nextText)) return false;
  if (/^[-,.;:!?)]/.test(nextText)) return false;
  if (output.trimEnd().endsWith('-')) return true;
  if (/[(/-]$/.test(output)) return false;
  return gap > Math.max(1.5, charWidth * 0.35);
}

function normalizePdfText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(/\u200b/g, '')
    .replace(/\u2022/g, '-')
    .replace(/[ \t\f\v]+/g, ' ');
}

function estimateTextWidth(text: string, height: number): number {
  return text.length * Math.max(4, height * 0.5);
}

function averageCharWidth(item: PositionedTextItem): number {
  return item.width / Math.max(1, item.text.trim().length);
}

function weightedAverage(current: number, currentWeight: number, next: number): number {
  return ((current * currentWeight) + next) / (currentWeight + 1);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}
