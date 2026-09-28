import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Every tab has to be reachable on a phone.
 *
 * These assertions read App.tsx as text rather than rendering it. Mounting
 * AppShell means standing up Firebase auth, the Sheets sync loop and the
 * whole tab tree, and the property being protected here is a CSS visibility
 * one that a jsdom render cannot observe anyway — happy-dom does not apply
 * Tailwind's media queries. A source check is blunt, but it catches the
 * exact regression that shipped, which a render test would not.
 */
const appSource = readFileSync(resolve(__dirname, '../src/App.tsx'), 'utf8');

describe('mobile navigation reachability', () => {
  it('the bottom bar navigates by group, landing on the first tab of each', () => {
    // Establishes the premise for the tests below: the bar cannot reach a
    // group's second tab on its own.
    expect(appSource).toContain('onClick={() => setActiveTab(group.tabs[0].id)}');
  });

  it('shows the in-group tab switcher on mobile, not only on desktop', () => {
    // Regression: this was `hidden md:flex`, so it rendered only where the
    // full sidebar already listed every tab, and was hidden on the phone
    // where the bottom bar could not reach a group's second tab. That left
    // Audit & Config, Fields & Directory and Inventory reachable only
    // through the hamburger drawer.
    const match = appSource.match(/data-testid="group-tab-switcher" className="([^"]+)"/);
    expect(match).not.toBeNull();

    const classes = match![1];
    expect(classes).not.toMatch(/\bhidden\b/);
    expect(classes).not.toMatch(/\bmd:hidden\b/);
    expect(classes).toMatch(/\bflex\b/);
  });

  it('lets the switcher wrap rather than overflow a narrow screen', () => {
    const classes = appSource.match(/data-testid="group-tab-switcher" className="([^"]+)"/)![1];
    expect(classes).toContain('flex-wrap');
  });

  it('still renders the switcher only where a group actually has siblings', () => {
    expect(appSource).toContain('activeGroup.tabs.length > 1');
  });
});
