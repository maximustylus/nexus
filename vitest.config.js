// vitest.config.js
//
// Test harness for the AURA client (ROSTER_TODO.md P0.2).
// Mirrors the app's build pipeline: the same React plugin Vite uses, so test
// files resolve JSX exactly as `npm run build` does.

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        // `globals` stays OFF on purpose: every test file imports
        // describe/it/expect/vi explicitly from 'vitest'. Enabling it would
        // let new tests silently depend on implicit globals instead.
        globals: false,
        include: ['src/**/*.{test,spec}.{js,jsx}'],
    },
});
