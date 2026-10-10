import { describe, expect, it } from 'vitest';
import {
  reconstructPdfDocumentText,
  reconstructPdfPageText,
  type PdfTextItemLike,
} from './pdf-text-layout';

function item(str: string, x: number, y: number, width = str.length * 5, height = 10): PdfTextItemLike {
  return {
    str,
    transform: [1, 0, 0, height, x, y],
    width,
    height,
  };
}

describe('pdf text layout reconstruction', () => {
  it('groups PDF.js text items into visual lines in reading order', () => {
    const text = reconstructPdfPageText([
      item('React', 90, 680, 26),
      item('Skills', 20, 680, 30),
      item('Jordan Rivera', 20, 720, 70),
      item('Seattle, WA', 20, 700, 52),
    ]);

    expect(text).toBe([
      'Jordan Rivera',
      'Seattle, WA',
      'Skills React',
    ].join('\n'));
  });

  it('keeps tight fragments together while adding spaces across real gaps', () => {
    const text = reconstructPdfPageText([
      item('jordan', 20, 720, 30),
      item('@strivo.ai', 50.2, 720, 45),
      item('Senior', 120, 720, 32),
      item('Engineer', 158, 720, 42),
    ]);

    expect(text).toBe('jordan@strivo.ai Senior Engineer');
  });

  it('normalizes ligatures, non-breaking spaces, and bullet characters', () => {
    const text = reconstructPdfPageText([
      item('•', 20, 680, 5),
      item('Improved\u00a0ofﬁce workﬂows', 30, 680, 120),
    ]);

    expect(text).toBe('- Improved office workflows');
  });

  it('separates accepted page text without flattening all whitespace', () => {
    const text = reconstructPdfDocumentText([
      'Jordan Rivera\nExperience',
      'Education\nSkills',
    ]);

    expect(text).toBe('Jordan Rivera\nExperience\n\nEducation\nSkills');
  });
});
