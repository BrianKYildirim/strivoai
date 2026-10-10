/**
 * StrengthsGapsGrid — render contract tests (Phase 17.1).
 *
 * Asserts must_haves.truths:
 * - Renders 2 cards ("What You Have", "Gaps to Close")
 * - Strengths card uses #10b981 (emerald) for icon + dots
 * - Gaps card uses #f59e0b (amber) for icon + dots
 * - Each list maps its items to list entries
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StrengthsGapsGrid } from './StrengthsGapsGrid';

const strengths = ['React mastery', 'System design', 'Leadership'];
const gaps = ['Rust', 'Kubernetes'];

describe('StrengthsGapsGrid', () => {
  it('renders both section headings', () => {
    render(<StrengthsGapsGrid strengths={strengths} gaps={gaps} />);
    expect(screen.getByRole('heading', { name: /what you have/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /gaps to close/i })).toBeInTheDocument();
  });

  it('renders every strength item', () => {
    render(<StrengthsGapsGrid strengths={strengths} gaps={gaps} />);
    strengths.forEach((s) => {
      expect(screen.getByText(s)).toBeInTheDocument();
    });
  });

  it('renders every gap item', () => {
    render(<StrengthsGapsGrid strengths={strengths} gaps={gaps} />);
    gaps.forEach((g) => {
      expect(screen.getByText(g)).toBeInTheDocument();
    });
  });

  it('uses emerald (#10b981) for strengths accent elements', () => {
    const { container } = render(
      <StrengthsGapsGrid strengths={strengths} gaps={gaps} />,
    );
    // Collect all elements with an inline color/background color referencing emerald.
    const emeraldMatchers = Array.from(container.querySelectorAll<HTMLElement>('[style]')).filter(
      (el) => {
        const style = (el.getAttribute('style') || '').toLowerCase();
        return style.includes('#10b981') || style.includes('rgb(16, 185, 129)');
      },
    );
    expect(emeraldMatchers.length).toBeGreaterThanOrEqual(
      1 + strengths.length, // icon + one dot per strength
    );
  });

  it('uses amber (#f59e0b) for gaps accent elements', () => {
    const { container } = render(
      <StrengthsGapsGrid strengths={strengths} gaps={gaps} />,
    );
    const amberMatchers = Array.from(container.querySelectorAll<HTMLElement>('[style]')).filter(
      (el) => {
        const style = (el.getAttribute('style') || '').toLowerCase();
        return style.includes('#f59e0b') || style.includes('rgb(245, 158, 11)');
      },
    );
    expect(amberMatchers.length).toBeGreaterThanOrEqual(
      1 + gaps.length, // icon + one dot per gap
    );
  });
});
