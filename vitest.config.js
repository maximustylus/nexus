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
        // `functions/` was added when lead approval landed. It had never been
        // covered by any test, and the approval handler is the one piece of NEXUS
        // that grants a person access to other people's clinical records — the last
        // place to accept "tested by deploying it". `functions/teamApproval.js`
        // takes its dependencies as arguments precisely so it can be collected here
        // without firebase-admin, credentials or an emulator.
        include: [
            'src/**/*.{test,spec}.{js,jsx}',
            'functions/**/*.{test,spec}.{js,cjs}',
        ],
        exclude: ['**/node_modules/**', '**/dist/**'],
    },
});
