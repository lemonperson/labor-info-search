import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { environment: 'node', include: ['tests/unit/**/*.{test.ts,test.tsx}', 'tests/integration/**/*.test.ts', 'tests/smoke/**/*.smoke.ts'] }
})
