import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['supabase/tests/rls/**/*.rls.test.ts'],
    // One shared database is shared mutable state. Serial execution keeps
    // fixtures from racing each other.
    pool: 'threads',
    fileParallelism: false,
    maxWorkers: 1,
    // Creating users and starting sessions is slower than a unit test.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
