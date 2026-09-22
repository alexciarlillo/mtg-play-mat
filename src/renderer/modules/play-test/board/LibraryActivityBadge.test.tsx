import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import LibraryActivityBadge from './LibraryActivityBadge';

const badge = () => screen.getByTestId('activity');

describe('LibraryActivityBadge', () => {
  it('shows nothing when nobody is in their library', () => {
    render(<LibraryActivityBadge activity={null} testId="activity" />);
    expect(screen.queryByTestId('activity')).toBeNull();
  });

  it('is silver for a look at the top of the library', () => {
    render(
      <LibraryActivityBadge
        activity={{ kind: 'look', count: 2 }}
        testId="activity"
      />
    );
    expect(badge()).toHaveAttribute('data-tone', 'silver');
    expect(badge()).toHaveAttribute('title', 'Looking at top 2…');
    expect(badge().className).toContain('ring-slate-100');
  });

  it('is gold for a search, so the two never read alike', () => {
    render(
      <LibraryActivityBadge activity={{ kind: 'search' }} testId="activity" />
    );
    expect(badge()).toHaveAttribute('data-tone', 'gold');
    expect(badge().className).toContain('ring-amber-300');
    expect(screen.getByText('Searching library…')).toBeInTheDocument();
  });

  it('shortens its label in a pod, keeping the colour', () => {
    render(
      <LibraryActivityBadge
        activity={{ kind: 'look', count: 3 }}
        compact
        testId="activity"
      />
    );
    expect(screen.getByText('Top 3…')).toBeInTheDocument();
    expect(badge()).toHaveAttribute('data-tone', 'silver');
  });
});
