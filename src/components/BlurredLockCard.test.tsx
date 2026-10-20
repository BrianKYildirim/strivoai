import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BlurredLockCard } from './BlurredLockCard';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('BlurredLockCard', () => {
  beforeEach(() => mockNavigate.mockReset());

  const renderIt = (props: { ctaHref?: string } = {}) =>
    render(
      <MemoryRouter>
        <BlurredLockCard {...props}>
          <div data-testid="child-content">Fake content</div>
        </BlurredLockCard>
      </MemoryRouter>
    );

  it('renders children inside a blurred container with aria-hidden', () => {
    renderIt();
    const blurred = screen.getByTestId('blurred-lock-card-content');
    expect(blurred).toHaveAttribute('aria-hidden', 'true');
    expect(blurred.className).toContain('blur-md');
    expect(blurred.className).toContain('pointer-events-none');
    expect(screen.getByTestId('child-content')).toBeInTheDocument();
  });

  it('renders a clickable overlay with role=button and aria-label', () => {
    renderIt();
    const overlay = screen.getByTestId('blurred-lock-card-overlay');
    expect(overlay).toHaveAttribute('role', 'button');
    expect(overlay).toHaveAttribute('aria-label', 'Upgrade to unlock your full potential');
    expect(overlay).toHaveAttribute('tabindex', '0');
  });

  it('navigates to /pricing on overlay click', () => {
    renderIt();
    fireEvent.click(screen.getByTestId('blurred-lock-card-overlay'));
    expect(mockNavigate).toHaveBeenCalledWith('/pricing');
  });

  it('navigates to custom ctaHref when provided', () => {
    renderIt({ ctaHref: '/upgrade' });
    fireEvent.click(screen.getByTestId('blurred-lock-card-overlay'));
    expect(mockNavigate).toHaveBeenCalledWith('/upgrade');
  });

  it('navigates on Enter key press', () => {
    renderIt();
    fireEvent.keyDown(screen.getByTestId('blurred-lock-card-overlay'), { key: 'Enter' });
    expect(mockNavigate).toHaveBeenCalledWith('/pricing');
  });
});
