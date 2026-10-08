import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The invariant and grid suites build hundreds of plans per test; shared CI
    // runners take ~2x longer than a dev machine, so the 5 s default is too tight.
    testTimeout: 60_000,
  },
});
