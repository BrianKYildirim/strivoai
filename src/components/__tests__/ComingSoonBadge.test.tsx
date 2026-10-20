import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComingSoonBadge } from '../ComingSoonBadge';

describe('ComingSoonBadge', () => {
  it('renders the "Coming Soon" label', () => {
    render(<ComingSoonBadge />);
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  });

  it('exposes an aria-label that includes "coming soon"', () => {
    render(<ComingSoonBadge />);
    const el = screen.getByText('Coming Soon');
    expect(el.getAttribute('aria-label')).toMatch(/coming soon/i);
  });

  it('uses semantic design tokens (text-muted-foreground, bg-muted) — not literal palette colors', () => {
    render(<ComingSoonBadge />);
    const el = screen.getByText('Coming Soon');
    expect(el.className).toMatch(/text-muted-foreground/);
    expect(el.className).toMatch(/bg-muted/);
  });

  it('respects a consumer-provided className via cn()', () => {
    render(<ComingSoonBadge className="ml-2 custom-marker" />);
    const el = screen.getByText('Coming Soon');
    expect(el.className).toMatch(/custom-marker/);
  });

  it('renders a different size class when size="md" is passed', () => {
    const { rerender } = render(<ComingSoonBadge size="sm" />);
    const smClass = screen.getByText('Coming Soon').className;
    rerender(<ComingSoonBadge size="md" />);
    const mdClass = screen.getByText('Coming Soon').className;
    expect(smClass).not.toBe(mdClass);
  });
});
