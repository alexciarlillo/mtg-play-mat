import type { PanelPlacement } from '@shared/settings';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FloatingPanel from './FloatingPanel';

// jsdom lays nothing out, so the room and the panel get fixed sizes.
const sizes = new Map<string, { width: number; height: number }>([
  ['room', { width: 1000, height: 600 }],
  ['panel', { width: 300, height: 200 }],
]);
const sizeOf = (el: HTMLElement) =>
  sizes.get(el.dataset.size ?? el.dataset.testid ?? '') ?? {
    width: 0,
    height: 0,
  };

beforeEach(() => {
  (
    [
      ['clientWidth', 'width'],
      ['offsetWidth', 'width'],
      ['clientHeight', 'height'],
      ['offsetHeight', 'height'],
    ] as const
  ).forEach(([prop, axis]) => {
    vi.spyOn(HTMLElement.prototype, prop, 'get').mockImplementation(
      function size(this: HTMLElement) {
        return sizeOf(this)[axis];
      }
    );
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const Harness = ({
  initial,
  onChange,
}: {
  initial: PanelPlacement;
  onChange(next: PanelPlacement): void;
}) => {
  const [placement, setPlacement] = useState(initial);
  return (
    <div data-size="room">
      <FloatingPanel
        title="Dice"
        testId="panel"
        placement={placement}
        onPlacementChange={(next) => {
          setPlacement(next);
          onChange(next);
        }}
      >
        <p>Body</p>
      </FloatingPanel>
    </div>
  );
};

const renderPanel = (initial: PanelPlacement) => {
  const onChange = vi.fn();
  render(<Harness initial={initial} onChange={onChange} />);
  return { panel: screen.getByTestId('panel'), onChange };
};

const translate = (el: HTMLElement) => el.style.transform;

describe('FloatingPanel', () => {
  it('sits where its placement says, inside a margin', () => {
    const { panel } = renderPanel({ x: 1, y: 1, collapsed: false });
    expect(translate(panel)).toBe('translate(688px, 388px)');
  });

  it('drags by the handle, clamps to the room, and saves a fraction', () => {
    const { panel, onChange } = renderPanel({ x: 0, y: 0, collapsed: false });
    const handle = screen.getByTestId('panel-handle');
    fireEvent.pointerDown(handle, {
      pointerId: 1,
      button: 0,
      clientX: 50,
      clientY: 50,
    });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 150, clientY: 90 });
    expect(translate(panel)).toBe('translate(112px, 52px)');
    fireEvent.pointerMove(handle, {
      pointerId: 1,
      clientX: 5000,
      clientY: -500,
    });
    expect(translate(panel)).toBe('translate(688px, 12px)');
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 5000, clientY: -500 });
    expect(onChange).toHaveBeenCalledWith({ x: 1, y: 0, collapsed: false });
  });

  it('does not save a click on the handle', () => {
    const { onChange } = renderPanel({ x: 0.5, y: 0.5, collapsed: false });
    const handle = screen.getByTestId('panel-handle');
    fireEvent.pointerDown(handle, { pointerId: 1, button: 0 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('collapses to its title bar and expands again', async () => {
    const user = userEvent.setup();
    const { panel, onChange } = renderPanel({
      x: 1,
      y: 1,
      collapsed: false,
    });
    expect(screen.getByText('Body')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Collapse Dice' }));
    expect(onChange).toHaveBeenLastCalledWith({
      x: 1,
      y: 1,
      collapsed: true,
    });
    expect(screen.queryByText('Body')).toBeNull();
    expect(panel).toHaveAttribute('data-collapsed', 'true');

    await user.click(screen.getByRole('button', { name: 'Expand Dice' }));
    expect(screen.getByText('Body')).toBeInTheDocument();
  });
});
