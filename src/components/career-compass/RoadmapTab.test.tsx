/**
 * RoadmapTab — render contract tests (Phase 17.1, GATE-06).
 *
 * Asserts must_haves.truths:
 * - Free tier with selected role roadmap + < 5 steps: renders BlurredLockCard for remaining phases
 * - Timeline blocks use #FF6B6B border
 * - getTimeline() labels map indices 0..4 to "Months 1-2", "3-5", "6-8", "9-10", "11-12"
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RoadmapTab } from './RoadmapTab';
import type { RoadmapItem, RoleRoadmap } from './types';

const general: RoadmapItem[] = [
  { category: 'Phase One', items: ['Alpha item'] },
  { category: 'Phase Two', items: ['Beta item'] },
  { category: 'Phase Three', items: ['Gamma item'] },
  { category: 'Phase Four', items: ['Delta item'] },
  { category: 'Phase Five', items: ['Epsilon item'] },
];

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe('RoadmapTab', () => {
  it('renders the "12-Month Career Roadmap" heading', () => {
    renderWithRouter(
      <RoadmapTab
        roadmap={general}
        subscriptionTier="pro"
        selectedRoadmapRole="__general__"
        onSelectedRoadmapRoleChange={() => {}}
      />,
    );
    expect(screen.getByText(/12-month career roadmap/i)).toBeInTheDocument();
  });

  it('renders all 5 general roadmap timeline labels (Months 1-2 through 11-12)', () => {
    renderWithRouter(
      <RoadmapTab
        roadmap={general}
        subscriptionTier="pro"
        selectedRoadmapRole="__general__"
        onSelectedRoadmapRoleChange={() => {}}
      />,
    );
    expect(screen.getByText('Months 1-2')).toBeInTheDocument();
    expect(screen.getByText('Months 3-5')).toBeInTheDocument();
    expect(screen.getByText('Months 6-8')).toBeInTheDocument();
    expect(screen.getByText('Months 9-10')).toBeInTheDocument();
    expect(screen.getByText('Months 11-12')).toBeInTheDocument();
  });

  it('renders category headings for each roadmap item', () => {
    renderWithRouter(
      <RoadmapTab
        roadmap={general}
        subscriptionTier="pro"
        selectedRoadmapRole="__general__"
        onSelectedRoadmapRoleChange={() => {}}
      />,
    );
    ['Phase One', 'Phase Two', 'Phase Three', 'Phase Four', 'Phase Five'].forEach((c) =>
      expect(screen.getByText(c)).toBeInTheDocument(),
    );
  });

  it('renders timeline containers with #FF6B6B border color', () => {
    const { container } = renderWithRouter(
      <RoadmapTab
        roadmap={general}
        subscriptionTier="pro"
        selectedRoadmapRole="__general__"
        onSelectedRoadmapRoleChange={() => {}}
      />,
    );
    const timelineBlocks = Array.from(container.querySelectorAll<HTMLElement>('.border-l-4')).filter(
      (el) => {
        const color = (el.style.borderColor || '').toLowerCase();
        return color.includes('#ff6b6b') || color.includes('rgb(255, 107, 107)');
      },
    );
    expect(timelineBlocks.length).toBeGreaterThanOrEqual(5);
  });

  it('GATE-06: free tier with role-specific roadmap + < 5 steps renders BlurredLockCard', () => {
    const roleRoadmaps: RoleRoadmap[] = [
      {
        role: 'Software Engineer',
        steps: [
          { phase: 'Months 1-2', category: 'Foundations', items: ['Basics'] },
          { phase: 'Months 3-5', category: 'Projects', items: ['Ship MVP'] },
        ],
      },
    ];
    renderWithRouter(
      <RoadmapTab
        roadmap={general}
        roleRoadmaps={roleRoadmaps}
        subscriptionTier="free"
        selectedRoadmapRole="Software Engineer"
        onSelectedRoadmapRoleChange={() => {}}
      />,
    );
    const overlays = screen.getAllByTestId('blurred-lock-card-overlay');
    expect(overlays.length).toBeGreaterThanOrEqual(1);
  });

  it('GATE-06: pro tier with role-specific roadmap does NOT render BlurredLockCard', () => {
    const roleRoadmaps: RoleRoadmap[] = [
      {
        role: 'Software Engineer',
        steps: [
          { phase: 'Months 1-2', category: 'Foundations', items: ['Basics'] },
        ],
      },
    ];
    renderWithRouter(
      <RoadmapTab
        roadmap={general}
        roleRoadmaps={roleRoadmaps}
        subscriptionTier="pro"
        selectedRoadmapRole="Software Engineer"
        onSelectedRoadmapRoleChange={() => {}}
      />,
    );
    expect(screen.queryAllByTestId('blurred-lock-card-overlay')).toHaveLength(0);
  });

  it('renders role-specific tailored header when a non-general role is selected', () => {
    const roleRoadmaps: RoleRoadmap[] = [
      {
        role: 'Data Scientist',
        steps: [
          { phase: 'Months 1-2', category: 'Stats', items: ['Study bayes'] },
        ],
      },
    ];
    renderWithRouter(
      <RoadmapTab
        roadmap={general}
        roleRoadmaps={roleRoadmaps}
        subscriptionTier="pro"
        selectedRoadmapRole="Data Scientist"
        onSelectedRoadmapRoleChange={() => {}}
      />,
    );
    expect(screen.getByText(/tailored roadmap for/i)).toBeInTheDocument();
    // "Data Scientist" appears in both the Select trigger and inside the
    // tailored header (<strong>). Both are valid renderings.
    expect(screen.getAllByText('Data Scientist').length).toBeGreaterThan(0);
  });
});
