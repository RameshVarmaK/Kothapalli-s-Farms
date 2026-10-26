import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from '../src/components/shell/Dialog';

function Harness({ onClose }: { onClose?: () => void }) {
  return (
    <>
      <button>Opener</button>
      <Dialog label="Delete entry" onClose={onClose} className="overlay">
        <button>First</button>
        <button>Last</button>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('is announced as a modal dialog with its name', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog', { name: 'Delete entry' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.className).toBe('overlay');
  });

  it('moves focus inside when it opens', () => {
    render(<Harness />);
    expect(document.activeElement).toBe(screen.getByText('First'));
  });

  it('closes on Escape only when closing is allowed', () => {
    const onClose = vi.fn();
    const { unmount } = render(<Harness onClose={onClose} />);
    fireEvent.keyDown(screen.getByText('First'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    render(<Harness />);
    fireEvent.keyDown(screen.getByText('First'), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy(); // still open, nothing to call
  });

  it('keeps Tab inside, wrapping at both ends', () => {
    render(<Harness />);
    const last = screen.getByText('Last');
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('First'));

    fireEvent.keyDown(screen.getByText('First'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('gives focus back to what opened it', () => {
    function Page({ open }: { open: boolean }) {
      return (
        <>
          <button>Opener</button>
          {open && <Dialog label="x"><button>Inside</button></Dialog>}
        </>
      );
    }
    const { rerender } = render(<Page open={false} />);
    screen.getByText('Opener').focus();
    rerender(<Page open />);
    expect(document.activeElement).toBe(screen.getByText('Inside'));
    rerender(<Page open={false} />);
    expect(document.activeElement).toBe(screen.getByText('Opener'));
  });

  it('still closes on Escape when focus has dropped to the page body', () => {
    // A form can remove the button that had focus (swapping it for new fields),
    // which leaves focus on <body>.
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('brings focus back inside when Tab is pressed from the body', () => {
    render(<Harness />);
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('First'));
  });

  it('lets only the topmost of two open dialogs answer Escape', () => {
    // A second dialog opened on top of the first, as a confirmation does.
    const outer = vi.fn();
    const inner = vi.fn();
    const Page = ({ showInner }: { showInner: boolean }) => (
      <>
        <Dialog label="outer" onClose={outer}><button>Outer button</button></Dialog>
        {showInner && <Dialog label="inner" onClose={inner}><button>Inner button</button></Dialog>}
      </>
    );
    const { rerender } = render(<Page showInner={false} />);
    rerender(<Page showInner />);

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();

    rerender(<Page showInner={false} />); // inner closed: outer answers again
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(outer).toHaveBeenCalledTimes(1);
  });
});
