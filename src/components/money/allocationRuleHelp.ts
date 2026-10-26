/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommonAllocationType } from '../../types';

/** One-line explanations of the shared-cost split rules, shown under the rule picker. */
export const allocationRuleHelp: Record<CommonAllocationType, string> = {
  equal: 'Splits the amount into identical shares across every checked field, regardless of size.',
  area: 'Splits the amount in proportion to each field’s registered acreage — bigger fields carry a bigger share.',
  manual: 'You set the exact rupee amount per field yourself. The entries must add up to the total below.'
};
