import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SOURCE = 'src/pages/Celebrations.tsx';
const source = readFileSync(SOURCE, 'utf8');

const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
  { label: 'literal bg-black', re: /\bbg-black\b/ },
  { label: 'literal text-white', re: /\btext-white(?:\/[^\s"']+)?\b/ },
  { label: 'literal bg-white opacity', re: /\bbg-white\// },
  { label: 'literal border-white', re: /\bborder-white(?:\/|\[)/ },
  { label: 'old glass blur on card surfaces', re: /\bbackdrop-blur-xl\b/ },
];

const classNameContaining = (text: string): string => {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`className="([^"]*)"[^>]*>\\s*${escaped}`));
  expect(match, `${SOURCE} should contain a className for "${text}"`).not.toBeNull();
  return match?.[1] ?? '';
};

const expectTokens = (className: string, tokens: string[]): void => {
  for (const token of tokens) {
    expect(className, `Expected className "${className}" to include ${token}`).toContain(token);
  }
};

const ambientGlowOpacities = (color: string): { light: number; dark: number } => {
  const match = source.match(
    new RegExp(`bg-${color}-500/\\[(0\\.\\d+)\\][^"]*dark:bg-${color}-500/(\\d+)`),
  );
  expect(match, `${color} ambient glow should define light and dark opacity stops`).not.toBeNull();
  return {
    light: Number(match?.[1]),
    dark: Number(match?.[2]) / 100,
  };
};

describe('CELEB-01 celebrations token guard', () => {
  for (const { label, re } of FORBIDDEN) {
    it(`Celebrations.tsx contains no ${label}`, () => {
      expect(re.test(source), `${label} should not remain in ${SOURCE}`).toBe(false);
    });
  }

  it('uses Card for the audio player, letter surface, and action tiles', () => {
    expect(source).toMatch(/import\s+\{\s*Card\s*\}\s+from\s+["']@\/components\/ui\/card["']/);

    const cardOccurrences = source.match(/<Card\b/g) ?? [];
    expect(cardOccurrences.length).toBeGreaterThanOrEqual(3);
  });

  it('uses primary treatment for the main CTA and player accents', () => {
    expect(source).toContain('bg-primary');
    expect(source).toContain('hover:bg-primary/90');
  });

  it('keeps action tiles as Link-based navigation to the core tools', () => {
    expect(source).toMatch(/<Link\s+to=\{card\.to\}/);
    expect(source).toMatch(/to:\s*"\/upload"/);
    expect(source).toMatch(/to:\s*"\/linkedin-grader"/);
    expect(source).toMatch(/to:\s*"\/career-compass"/);
  });
});

describe('CELEB-02 celebrations light and dark readability parity guard', () => {
  it('keeps light and dark gradient stops on the three emotional text moments', () => {
    expectTokens(classNameContaining('unfair advantage'), [
      'bg-gradient-to-r',
      'from-indigo-700',
      'via-violet-700',
      'to-blue-700',
      'dark:from-indigo-400',
      'dark:via-violet-400',
      'dark:to-blue-400',
      'text-transparent',
    ]);

    expectTokens(classNameContaining('strive for excellence'), [
      'bg-gradient-to-r',
      'from-yellow-700',
      'via-orange-700',
      'to-amber-700',
      'dark:from-yellow-300',
      'dark:via-orange-300',
      'dark:to-amber-400',
      'text-transparent',
    ]);

    expectTokens(classNameContaining('#{userCount.toLocaleString()}'), [
      'bg-gradient-to-r',
      'from-indigo-700',
      'via-violet-700',
      'to-blue-700',
      'dark:from-indigo-300',
      'dark:via-violet-300',
      'dark:to-blue-300',
      'text-transparent',
    ]);
  });

  it('keeps user-facing copy on semantic text tokens without opacity-reduced text hacks', () => {
    expect(source).toContain('bg-background text-foreground');
    expect(source).toContain('text-card-foreground');
    expect(source).toContain('text-muted-foreground');
    expect(source).toContain('text-foreground');

    expect(source).not.toMatch(/\btext-(?:foreground|muted-foreground|card-foreground)\/\d+\b/);
    expect(source).not.toMatch(/\btext-opacity-\d+\b/);
    expect(source).not.toMatch(/\bopacity-\d+\b[^"]*(?:average|welcome aboard|what's next|Adventure of a Lifetime)/);
  });

  it('keeps CTA, audio, visualizer, and action icon accents on primary readable treatment', () => {
    expect(source).toMatch(
      /className="[^"]*\bbg-primary\b[^"]*\btext-foreground\b[^"]*\bhover:bg-primary\/90\b[^"]*\bdark:text-background\b[^"]*"/,
    );
    expect(source).toMatch(
      /className="[^"]*\bbg-primary\b[^"]*\bfont-semibold\b[^"]*\btext-foreground\b[^"]*\bhover:bg-primary\/90\b[^"]*\bdark:text-background\b[^"]*"/,
    );
    expect(source).toMatch(/className="[^"]*\bbg-primary\/10\b[^"]*\btext-primary\b[^"]*"/);
    expect(source).toMatch(/className="[^"]*\bbg-primary\b"/);
  });

  it('keeps ambient glows dimmer in light mode and stronger in dark mode', () => {
    for (const color of ['indigo', 'amber']) {
      const { light, dark } = ambientGlowOpacities(color);
      expect(light, `${color} light glow should stay subtle`).toBeLessThan(0.1);
      expect(dark, `${color} dark glow should be stronger than light`).toBeGreaterThan(light);
    }
  });

  it('preserves readable section surfaces and navigation while guarding CELEB-02 parity', () => {
    expect(source).toContain('rounded-full border border-border bg-card/70');
    expect(source).toContain('hover:border-primary/30 hover:bg-secondary/50 hover:shadow-md');
    expect(source).toContain('focus-visible:ring-ring');
    expect(source).toContain('focus-visible:ring-offset-background');

    const cardOccurrences = source.match(/<Card\b/g) ?? [];
    expect(cardOccurrences.length).toBeGreaterThanOrEqual(3);
    expect(source.match(/to:\s*"\/(?:upload|linkedin-grader|career-compass)"/g) ?? []).toHaveLength(3);
    expect(source).toMatch(/<Link\s+to=\{card\.to\}/);
  });
});
