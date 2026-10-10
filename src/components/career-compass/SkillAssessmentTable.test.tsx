/**
 * SkillAssessmentTable — render contract tests (Phase 17.1).
 *
 * Asserts must_haves.truths:
 * - Renders a 4-column table header: Skill, Your Level, Industry Expects, Gap
 * - Gap cell uses:
 *     text-green-600 for "None" / "Exceeds"
 *     text-amber-600 for "Minor"
 *     text-red-500 otherwise
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkillAssessmentTable } from './SkillAssessmentTable';
import type { SkillAssessment } from './types';

const assessments: SkillAssessment[] = [
  { skill: 'React', yourLevel: 'Senior', industryExpectation: 'Senior', gap: 'None' },
  { skill: 'TypeScript', yourLevel: 'Expert', industryExpectation: 'Senior', gap: 'Exceeds' },
  { skill: 'Rust', yourLevel: 'Junior', industryExpectation: 'Mid', gap: 'Minor' },
  { skill: 'K8s', yourLevel: 'Beginner', industryExpectation: 'Senior', gap: 'Significant' },
];

describe('SkillAssessmentTable', () => {
  it('renders all 4 column headers', () => {
    render(<SkillAssessmentTable skillAssessments={assessments} />);
    expect(screen.getByText('Skill')).toBeInTheDocument();
    expect(screen.getByText('Your Level')).toBeInTheDocument();
    expect(screen.getByText('Industry Expects')).toBeInTheDocument();
    expect(screen.getByText('Gap')).toBeInTheDocument();
  });

  it('renders a row for every assessment', () => {
    const { container } = render(<SkillAssessmentTable skillAssessments={assessments} />);
    const bodyRows = container.querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(assessments.length);
  });

  it('applies text-green-600 to gap cells showing "None"', () => {
    render(<SkillAssessmentTable skillAssessments={assessments} />);
    const cell = screen.getByText('None');
    expect(cell.className).toContain('text-green-600');
  });

  it('applies text-green-600 to gap cells showing "Exceeds"', () => {
    render(<SkillAssessmentTable skillAssessments={assessments} />);
    const cell = screen.getByText('Exceeds');
    expect(cell.className).toContain('text-green-600');
  });

  it('applies text-amber-600 to gap cells showing "Minor"', () => {
    render(<SkillAssessmentTable skillAssessments={assessments} />);
    const cell = screen.getByText('Minor');
    expect(cell.className).toContain('text-amber-600');
  });

  it('applies text-red-500 to any other gap value', () => {
    render(<SkillAssessmentTable skillAssessments={assessments} />);
    const cell = screen.getByText('Significant');
    expect(cell.className).toContain('text-red-500');
  });
});
