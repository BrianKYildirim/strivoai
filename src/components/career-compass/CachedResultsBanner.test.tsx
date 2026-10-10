/**
 * CachedResultsBanner — render contract tests (Phase 17.1).
 *
 * Asserts must_haves.truths:
 * - Renders a refresh button with "Refresh Analysis" copy
 * - Clicking the button calls the onRefresh prop
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CachedResultsBanner } from './CachedResultsBanner';

describe('CachedResultsBanner', () => {
  it('renders a "Refresh Analysis" button', () => {
    render(<CachedResultsBanner onRefresh={() => {}} />);
    expect(screen.getByRole('button', { name: /refresh analysis/i })).toBeInTheDocument();
  });

  it('renders cached-state descriptive copy', () => {
    render(<CachedResultsBanner onRefresh={() => {}} />);
    expect(
      screen.getByText(/showing your saved career compass results/i),
    ).toBeInTheDocument();
  });

  it('calls onRefresh when the button is clicked', () => {
    const onRefresh = vi.fn();
    render(<CachedResultsBanner onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: /refresh analysis/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
