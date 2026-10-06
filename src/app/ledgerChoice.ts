/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { safeStorageGet, safeStorageSet } from '../utils/database';

/** Records that this device's owner has deliberately settled which ledger
 * to use — by linking one, creating one, or choosing to stay offline.
 * Without it the "this ledger is empty" prompt in the sign-in auto-fetch would nag someone who
 * genuinely did just start a fresh, still-empty ledger. */
const LEDGER_CHOICE_KEY = 'farmledger_ledger_choice_made';
export const hasChosenLedger = () => safeStorageGet(LEDGER_CHOICE_KEY) === 'true';
export const rememberLedgerChoice = () => safeStorageSet(LEDGER_CHOICE_KEY, 'true');
