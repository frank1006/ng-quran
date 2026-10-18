// Tests for the Vercel functions in api/ (npm run test:api). The app's own tests run with ng test.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['api/_tests/**/*.test.ts'],
    environment: 'node',
  },
});
