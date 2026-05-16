import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./services/storage/storageManager', () => ({
  storageManager: {
    initIndexedDB: jest.fn(),
  },
}));

test('renders dashboard', () => {
  render(<App />);
  const title = screen.getAllByText(/dashboard/i)[0];
  expect(title).toBeInTheDocument();
});
