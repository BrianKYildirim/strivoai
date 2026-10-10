/**
 * ScoreRing — render contract tests (Phase 17.1).
 *
 * Asserts must_haves.truths:
 * - Renders SVG with #FF6B6B stroke for progress arc
 * - Computes strokeDasharray correctly for the given score
 * - Uses default 160x160 / radius 70 / stroke 12 dimensions
 * - Displays "{score}%" + "Ready" label
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreRing } from './ScoreRing';

describe('ScoreRing', () => {
  it('displays the score as "{score}%"', () => {
    render(<ScoreRing score={72} />);
    expect(screen.getByText('72%')).toBeInTheDocument();
  });

  it('displays the "Ready" label', () => {
    render(<ScoreRing score={72} />);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('renders the progress circle with #FF6B6B stroke', () => {
    const { container } = render(<ScoreRing score={50} />);
    const progressCircle = container.querySelector('circle[stroke="#FF6B6B"]');
    expect(progressCircle).not.toBeNull();
  });

  it('defaults size to 160 on the container div', () => {
    const { container } = render(<ScoreRing score={50} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.width).toBe('160px');
    expect(wrapper.style.height).toBe('160px');
  });

  it('defaults radius to 70 and stroke-width to 12 on both circles', () => {
    const { container } = render(<ScoreRing score={50} />);
    const circles = container.querySelectorAll('circle');
    expect(circles).toHaveLength(2);
    circles.forEach((c) => {
      expect(c.getAttribute('r')).toBe('70');
      expect(c.getAttribute('stroke-width')).toBe('12');
    });
  });

  it('computes strokeDasharray as "(score/100)*circumference circumference"', () => {
    const score = 50;
    const radius = 70;
    const circumference = 2 * Math.PI * radius;
    const expectedFilled = (score / 100) * circumference;

    const { container } = render(<ScoreRing score={score} />);
    const progressCircle = container.querySelector('circle[stroke="#FF6B6B"]') as SVGCircleElement;
    const dasharray = progressCircle.getAttribute('stroke-dasharray') || '';
    const [filledStr, totalStr] = dasharray.split(/\s+/);
    expect(parseFloat(filledStr)).toBeCloseTo(expectedFilled, 3);
    expect(parseFloat(totalStr)).toBeCloseTo(circumference, 3);
  });

  it('respects custom size/radius/strokeWidth props', () => {
    const { container } = render(
      <ScoreRing score={80} size={100} radius={40} strokeWidth={8} />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.width).toBe('100px');
    const circles = container.querySelectorAll('circle');
    circles.forEach((c) => {
      expect(c.getAttribute('r')).toBe('40');
      expect(c.getAttribute('stroke-width')).toBe('8');
    });
  });
});
