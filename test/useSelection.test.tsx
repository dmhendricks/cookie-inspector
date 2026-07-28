/** @jsxImportSource preact */
/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { useSelection } from '../src/panel/hooks/useSelection';

afterEach(() => {
  cleanup();
});

function Harness({
  ids,
  keyboardEnabled = true,
}: {
  ids: readonly string[];
  keyboardEnabled?: boolean;
}) {
  const { selectedIds, clearSelection, prepareContextMenu, onRowClick } = useSelection(
    ids,
    keyboardEnabled,
  );

  return (
    <div>
      <div data-testid="selected">{[...selectedIds].sort().join(',')}</div>
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          data-testid={`row-${id}`}
          onClick={(e) => onRowClick(e as unknown as MouseEvent, id)}
          onContextMenu={(e) => {
            e.preventDefault();
            prepareContextMenu(id);
          }}
        >
          {id}
        </button>
      ))}
      <button type="button" data-testid="clear" onClick={clearSelection}>
        clear
      </button>
      <button type="button" data-testid="filler-menu" onClick={() => prepareContextMenu(null)}>
        filler
      </button>
    </div>
  );
}

function selected(): string {
  return screen.getByTestId('selected').textContent ?? '';
}

describe('useSelection', () => {
  const ids = ['a', 'b', 'c', 'd'] as const;

  it('selects a single row on click', () => {
    render(<Harness ids={ids} />);
    fireEvent.click(screen.getByTestId('row-b'));
    expect(selected()).toBe('b');
  });

  it('toggles additive selection with ctrl/meta click', () => {
    render(<Harness ids={ids} />);
    fireEvent.click(screen.getByTestId('row-a'));
    fireEvent.click(screen.getByTestId('row-c'), { ctrlKey: true });
    expect(selected()).toBe('a,c');
    fireEvent.click(screen.getByTestId('row-a'), { metaKey: true });
    expect(selected()).toBe('c');
  });

  it('selects a range with shift-click from the anchor', () => {
    render(<Harness ids={ids} />);
    fireEvent.click(screen.getByTestId('row-b'));
    fireEvent.click(screen.getByTestId('row-d'), { shiftKey: true });
    expect(selected()).toBe('b,c,d');
  });

  it('clears selection on Escape when keyboard is enabled', () => {
    render(<Harness ids={ids} />);
    fireEvent.click(screen.getByTestId('row-a'));
    expect(selected()).toBe('a');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(selected()).toBe('');
  });

  it('ignores keyboard shortcuts when keyboardEnabled is false', () => {
    render(<Harness ids={ids} keyboardEnabled={false} />);
    fireEvent.click(screen.getByTestId('row-a'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(selected()).toBe('a');
  });

  it('selects all visible rows with Ctrl/Cmd+A', () => {
    render(<Harness ids={ids} />);
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    expect(selected()).toBe('a,b,c,d');
  });

  it('extends selection with Shift+ArrowDown', () => {
    render(<Harness ids={ids} />);
    fireEvent.click(screen.getByTestId('row-b'));
    fireEvent.keyDown(window, { key: 'ArrowDown', shiftKey: true });
    expect(selected()).toBe('b,c');
  });

  it('prunes selection when visible ids shrink', () => {
    const { rerender } = render(<Harness ids={ids} />);
    fireEvent.click(screen.getByTestId('row-a'));
    fireEvent.click(screen.getByTestId('row-c'), { ctrlKey: true });
    expect(selected()).toBe('a,c');
    rerender(<Harness ids={['a', 'b']} />);
    expect(selected()).toBe('a');
  });

  it('prepareContextMenu keeps multi-select and clears on filler', () => {
    render(<Harness ids={ids} />);
    fireEvent.click(screen.getByTestId('row-a'));
    fireEvent.click(screen.getByTestId('row-c'), { ctrlKey: true });
    fireEvent.contextMenu(screen.getByTestId('row-c'));
    expect(selected()).toBe('a,c');
    fireEvent.click(screen.getByTestId('filler-menu'));
    expect(selected()).toBe('');
  });

  it('clearSelection empties the selection', () => {
    render(<Harness ids={ids} />);
    fireEvent.click(screen.getByTestId('row-a'));
    fireEvent.click(screen.getByTestId('clear'));
    expect(selected()).toBe('');
  });
});
