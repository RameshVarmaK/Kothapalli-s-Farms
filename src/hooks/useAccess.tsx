import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Access, FULL_ACCESS, SheetAccess } from '../app/access';
import { fetchSheetAccess, ensureMembersProtection } from '../utils/googleSheets';
import { isPlaceholderSpreadsheetId } from '../utils/database';
import { logWarning, logInfo } from '../utils/errorLogging';

const AccessContext = createContext<Access>(FULL_ACCESS);

export function AccessProvider({ value, children }: { value: Access; children: ReactNode }) {
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

/** The signed-in partner's permissions. Full access outside the app shell. */
export function useAccess(): Access {
  return useContext(AccessContext);
}

/**
 * Asks Drive what this account may do with the linked sheet. 'unknown' until
 * answered, and stays 'unknown' when Drive will not say, so a partner on a
 * flaky connection is not locked out of a ledger they can edit.
 */
export function useSheetAccess(accessToken: string | null, spreadsheetId: string | undefined) {
  const [state, setState] = useState<{ sheetAccess: SheetAccess; ownedByMe: boolean }>({ sheetAccess: 'unknown', ownedByMe: false });

  useEffect(() => {
    if (!accessToken || !spreadsheetId || isPlaceholderSpreadsheetId(spreadsheetId)) {
      setState({ sheetAccess: 'unknown', ownedByMe: false });
      return;
    }
    let cancelled = false;
    fetchSheetAccess(accessToken, spreadsheetId).then(result => {
      if (cancelled) return;
      if (!result) {
        logWarning('sheet_access_unknown', 'Drive did not report the sheet capabilities; assuming edit access', { sheetId: spreadsheetId });
        setState({ sheetAccess: 'unknown', ownedByMe: false });
        return;
      }
      setState({ sheetAccess: result.canEdit ? 'edit' : 'view', ownedByMe: result.ownedByMe });
    });
    return () => { cancelled = true; };
  }, [accessToken, spreadsheetId]);

  return state;
}

/**
 * Keeps the sheet's Members tab editable only by the owners, once roles are
 * in use. Runs from the Drive owner's session, since that account can
 * always manage protections, and again whenever the set of owners changes.
 */
export function useRolesProtection(input: {
  accessToken: string | null;
  spreadsheetId: string | undefined;
  enabled: boolean;
  ownerEmails: string[];
}) {
  const { accessToken, spreadsheetId, enabled } = input;
  const owners = input.ownerEmails.map(e => e.trim().toLowerCase()).filter(Boolean).sort().join(',');
  useEffect(() => {
    if (!enabled || !accessToken || !spreadsheetId || isPlaceholderSpreadsheetId(spreadsheetId) || !owners) return;
    let cancelled = false;
    ensureMembersProtection(accessToken, spreadsheetId, owners.split(',')).then(result => {
      if (cancelled) return;
      if (result === null) logWarning('roles_protection_failed', 'Could not protect the Members tab', { sheetId: spreadsheetId });
      else if (result !== 'unchanged') logInfo('roles_protection_' + result, 'Members tab protected for owners only', { sheetId: spreadsheetId, owners });
    });
    return () => { cancelled = true; };
  }, [enabled, accessToken, spreadsheetId, owners]);
}
