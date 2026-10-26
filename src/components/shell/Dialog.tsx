/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'role' | 'aria-label'> {
  /** Names the dialog for screen readers. */
  label: string;
  /** Called on Escape. Leave out for a dialog the user has to answer. */
  onClose?: () => void;
}

/** Open dialogs, innermost last: only the top one answers the keyboard. */
const openDialogs: symbol[] = [];

/**
 * The full-screen overlay every modal sits in. Beyond the backdrop it makes
 * the overlay a proper dialog: announced with its name, focus moves in when it
 * opens and returns to where it was when it closes, Tab stays inside it, and
 * Escape closes it when closing is allowed.
 *
 * Keys are caught on the document, not on the dialog: a form often removes the
 * very button that has focus (switching to "paid by several partners" swaps it
 * for the new fields), which drops focus to the page body, and a handler on
 * the dialog itself would then never hear Escape or Tab again.
 */
export function Dialog({ label, onClose, children, ...rest }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const id = Symbol('dialog');
    openDialogs.push(id);
    const previous = document.activeElement as HTMLElement | null;
    // A field that took its own autofocus keeps it.
    if (!node.contains(document.activeElement)) {
      (node.querySelector<HTMLElement>(FOCUSABLE) ?? node).focus({ preventScroll: true });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== id) return;

      if (e.key === 'Escape' && closeRef.current) {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = !!active && node.contains(active);
      if (!inside) {
        // Focus has wandered out (or dropped to the body): bring it back.
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const at = openDialogs.indexOf(id);
      if (at !== -1) openDialogs.splice(at, 1);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} {...rest}>
      {children}
    </div>
  );
}
