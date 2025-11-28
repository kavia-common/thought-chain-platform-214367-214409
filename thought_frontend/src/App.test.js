import { render, screen } from '@testing-library/react';
import App from './App';

test('renders app brand', () => {
  render(<App />);
  const brand1 = screen.getByText(/Daily/i);
  const brand2 = screen.getByText(/Thought Chain/i);
  expect(brand1).toBeInTheDocument();
  expect(brand2).toBeInTheDocument();
});
