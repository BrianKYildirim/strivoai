/**
 * CareerDNACard — render contract tests (Phase 17.1).
 *
 * Asserts must_haves.truths:
 * - Card root uses #FF6B6B accent border
 * - Renders "Your Career DNA" heading
 * - Renders domain badge when detectedDomain prop is present
 * - Renders domainEvidence list joined with commas when provided
 * - Renders careerDNA prop text
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CareerDNACard } from './CareerDNACard';

describe('CareerDNACard', () => {
  it('renders the "Your Career DNA" heading', () => {
    render(<CareerDNACard careerDNA="You are a builder." />);
    expect(screen.getByRole('heading', { name: /your career dna/i })).toBeInTheDocument();
  });

  it('renders the careerDNA prop text', () => {
    render(<CareerDNACard careerDNA="You are a versatile product builder." />);
    expect(screen.getByText(/versatile product builder/i)).toBeInTheDocument();
  });

  it('renders the card root with a #FF6B6B accent border', () => {
    const { container } = render(
      <CareerDNACard careerDNA="You are a builder." />,
    );
    const card = container.querySelector('[style*="border-color"]') as HTMLElement | null;
    expect(card).not.toBeNull();
    // jsdom normalises the inline style; accept either hex form
    const borderColor = (card!.style.borderColor || '').toLowerCase();
    expect(borderColor).toMatch(/#ff6b6b|rgb\(255,\s*107,\s*107\)/);
  });

  it('renders a domain badge when detectedDomain is provided', () => {
    render(
      <CareerDNACard
        careerDNA="You are a builder."
        detectedDomain="Technology"
      />,
    );
    expect(screen.getByText('Technology')).toBeInTheDocument();
  });

  it('omits the domain badge when detectedDomain is undefined', () => {
    render(<CareerDNACard careerDNA="You are a builder." />);
    expect(screen.queryByText('Technology')).not.toBeInTheDocument();
  });

  it('renders domain evidence list with commas when provided', () => {
    render(
      <CareerDNACard
        careerDNA="You are a builder."
        detectedDomain="Technology"
        domainEvidence={['React', 'TypeScript', 'Supabase']}
      />,
    );
    expect(screen.getByText(/based on:/i).textContent).toContain('React, TypeScript, Supabase');
  });
});
