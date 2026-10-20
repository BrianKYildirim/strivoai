import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ComingSoon from '../ComingSoon';

const renderPage = () =>
  render(
    <BrowserRouter>
      <ComingSoon />
    </BrowserRouter>,
  );

describe('ComingSoon page', () => {
  it('renders an h1 mentioning Interview Prep and Coming Soon', () => {
    renderPage();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent ?? '').toMatch(/interview prep.*coming soon/i);
  });

  it('renders a "Back to dashboard" link pointing to /dashboard', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /back to dashboard/i });
    expect(link.getAttribute('href')).toBe('/dashboard');
  });

  it('uses semantic design tokens — has text-foreground or text-muted-foreground somewhere in the DOM', () => {
    const { container } = renderPage();
    const html = container.innerHTML;
    expect(html).toMatch(/text-foreground|text-muted-foreground/);
  });

  it('omits specific timing copy (no "Q3 2026", "next month", etc.)', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/Q\d 20\d{2}/i);
    expect(text).not.toMatch(/next month/i);
  });
});
