import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SwimLogFlow } from './SwimLogFlow';

const AUTH_KEY = 'pool-dashboard-chem-auth';

function seedUnlocked() {
  localStorage.setItem(AUTH_KEY, btoa('alice:s3cret'));
}

function renderFlow(props: Partial<React.ComponentProps<typeof SwimLogFlow>> = {}) {
  render(
    <SwimLogFlow
      open
      swims={[]}
      onClose={vi.fn()}
      onSaved={vi.fn()}
      onDeleted={vi.fn()}
      {...props}
    />,
  );
}

describe('SwimLogFlow', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('renders nothing when not open', () => {
    const { container } = render(
      <SwimLogFlow open={false} swims={[]} onClose={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the swim unlock sheet first when locked', () => {
    renderFlow();
    expect(screen.getByText(/Unlock to log a swim/i)).toBeInTheDocument();
    // The swim picker (a SwimLogForm-only control) must not be present yet.
    expect(screen.queryByRole('button', { name: /log swim/i })).not.toBeInTheDocument();
  });

  it('renders the SwimLogForm (not the unlock sheet) when unlocked', () => {
    seedUnlocked();
    renderFlow();
    expect(screen.queryByText(/Unlock to log a swim/i)).not.toBeInTheDocument();
    // SwimLogForm renders the "Log swim" primary action and the swimmer tiles.
    expect(screen.getByRole('button', { name: /log swim/i })).toBeInTheDocument();
    expect(screen.getAllByTestId('swim-tile').length).toBeGreaterThan(0);
  });
});
