import { describe, it } from 'vitest';
import { allTests } from './calculationScenarios';

describe('calculation scenarios', () => {
  for (const t of allTests) it(t.name, t.fn);
});
