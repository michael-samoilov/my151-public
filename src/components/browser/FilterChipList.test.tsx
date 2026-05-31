import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterChipList } from './FilterChipList';

const items = [
  { id: 'a', name: 'Alpha', color: '#f00' },
  { id: 'b', name: 'Beta', color: '#0f0' },
];

describe('FilterChipList', () => {
  it('renders a button per item', () => {
    render(<FilterChipList items={items} activeId={null} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Beta' })).toBeInTheDocument();
  });

  it('fills only the active chip with its color', () => {
    render(<FilterChipList items={items} activeId="b" onSelect={() => {}} />);
    const beta = screen.getByRole('button', { name: 'Beta' });
    const alpha = screen.getByRole('button', { name: 'Alpha' });
    expect(beta).toHaveStyle({ backgroundColor: '#0f0' });
    expect(alpha.getAttribute('style') ?? '').not.toContain('background-color');
  });

  it('calls onSelect with the chip id', async () => {
    const onSelect = vi.fn();
    render(<FilterChipList items={items} activeId={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    expect(onSelect).toHaveBeenCalledWith('a');
  });
});
