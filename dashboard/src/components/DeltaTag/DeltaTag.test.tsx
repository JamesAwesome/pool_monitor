import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeltaTag } from './DeltaTag';

describe('DeltaTag', () => {
  it('renders an up arrow and magnitude', () => {
    render(<DeltaTag delta={{ dir: 'up', magnitude: 0.2 }} decimals={1} />);
    expect(screen.getByText(/↑/)).toBeInTheDocument();
    expect(screen.getByText(/0\.2/)).toBeInTheDocument();
  });

  it('renders a dimmed ±0 when flat', () => {
    render(<DeltaTag delta={{ dir: 'flat', magnitude: 0 }} decimals={0} />);
    expect(screen.getByText('±0')).toBeInTheDocument();
  });

  it('renders nothing when delta is null', () => {
    const { container } = render(<DeltaTag delta={null} decimals={1} />);
    expect(container).toBeEmptyDOMElement();
  });
});
