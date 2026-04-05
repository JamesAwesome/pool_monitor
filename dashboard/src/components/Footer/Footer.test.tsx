import { render, screen } from '@testing-library/react';
import { Footer } from './Footer';

describe('Footer', () => {
  it('renders with current year', () => {
    render(<Footer />);
    const year = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(year))).toBeTruthy();
  });

  it('renders Pool Monitor text', () => {
    render(<Footer />);
    expect(screen.getByText(/Pool Monitor/)).toBeTruthy();
  });
});
