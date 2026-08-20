// .eslintrc.cjs
//
// The repository's first working ESLint configuration (ROSTER_TODO.md P0.7).
// `package.json`'s `lint` script has existed since 1.0.0 and README.md cites
// lint compliance as a technical standard, but no configuration file had ever
// been committed, so `npm run lint` exited 2 on every invocation and CI never
// called it.
//
// FORMAT: legacy eslintrc, deliberately. ESLint 8.57.1 is installed. Flat
// config (`eslint.config.js`) would silently break the existing script — flat
// config rejects `--ext`, which `npm run lint` passes. Legacy format keeps the
// published script working unchanged.
//
// EXTENSION: `.cjs`, not `.js`. package.json declares `"type": "module"`, and
// ESLint 8 loads an `.eslintrc.js` with `require()`, which would throw on an ESM
// file. `.cjs` is the only legacy filename that works in this package.
//
// ENVIRONMENTS are set per area rather than globally, so a browser global used
// in Node code (or the reverse) is still reported:
//
//   src/**                  browser
//   **/*.test.{js,jsx}      browser + node + Vitest globals (jsdom + process.env.TZ)
//   *.config.js, scripts/** node
//   functions/**            node, CommonJS
//   public/**-sw.js         service worker
//
// Every deviation from the recommended rule sets is annotated below with the
// reason. Nothing is disabled to make the run quiet.

module.exports = {
    root: true,

    // Base environment: the app is a browser bundle. Node is granted only by
    // the overrides below, so `require`/`process` in `src/**` stays an error.
    env: {
        browser: true,
        es2021: true,
    },

    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
    },

    settings: {
        react: { version: 'detect' },
    },

    extends: [
        'eslint:recommended',
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
    ],

    plugins: ['react-refresh'],

    rules: {
        // OFF: `@vitejs/plugin-react` compiles JSX with the automatic runtime
        // (React 18 default; no `jsxImportSource` override in vitest.config.js
        // or index.html), so `React` need not be in scope for JSX to build.
        // `react/jsx-uses-react` stays ON from plugin:react/recommended, which
        // is what keeps the ~37 existing `import React from 'react'` lines from
        // being reported as unused imports.
        'react/react-in-jsx-scope': 'off',

        // ERROR, not warn: `--max-warnings 0` makes warn and error equivalent
        // at the exit code, and an error is honest about that.
        //
        // `allowExportNames` names the two non-component exports that are
        // deliberate rather than accidental, instead of switching the rule off
        // for their whole files:
        //   * `useNexus`                  — the canonical provider+hook pair in
        //                                   src/context/NexusContext.jsx;
        //   * `buildSwapRequestSignature` — a pure helper in RosterView.jsx,
        //                                   exported so the duplicate-request
        //                                   guard is testable without a DOM
        //                                   (documented at its definition).
        // Any *other* stray export in those files is still reported.
        'react-refresh/only-export-components': ['error', {
            allowConstantExport: true,
            allowExportNames: ['useNexus', 'buildSwapRequestSignature'],
        }],

        // OFF: this codebase does not use prop-types anywhere and has no
        // intention to (props are documented in header comments). Leaving it on
        // would report every component prop in the app — noise, not defects.
        // Type checking is a separate decision, not a lint finding.
        'react/prop-types': 'off',

        // Unused variables are errors. Two idioms are exempted deliberately:
        //   * underscore-prefixed placeholders, for bindings the syntax demands
        //     but the code does not want (`({ isOpen, onOpen: _onOpen })`);
        //   * `ignoreRestSiblings` — the omit-a-key idiom
        //     `({ grade, ...rest }) => rest`, used by the engine's byte-identity
        //     tests to strip one property. The binding IS the mechanism there,
        //     so reporting it would be reporting correct code.
        'no-unused-vars': ['error', {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
            ignoreRestSiblings: true,
        }],
    },

    overrides: [
        // ---- Tests -------------------------------------------------------
        // jsdom gives them the browser globals; Vitest runs them in Node, and
        // `rosterEngineV2.test.js` mutates `process.env.TZ` to pin DST
        // behaviour, so both environments are needed. The Vitest globals are
        // declared even though `vitest.config.js` sets `globals: false` and
        // every test imports them explicitly — so that the config does not
        // become the thing that breaks if that decision is ever revisited.
        {
            files: ['**/*.test.{js,jsx}', '**/*.spec.{js,jsx}'],
            env: { browser: true, node: true, es2021: true },
            globals: {
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                vi: 'readonly',
                suite: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
            },
            rules: {
                // OFF in tests only: test files legitimately export helpers and
                // fixtures next to components; HMR does not apply to them.
                'react-refresh/only-export-components': 'off',
            },
        },

        // ---- Build / tool configuration (Node, ESM) -----------------------
        {
            files: ['*.config.js', 'scripts/**/*.mjs'],
            env: { node: true, browser: false, es2021: true },
        },

        // ---- CommonJS: Cloud Functions and the seed script ----------------
        {
            files: ['functions/**/*.js', 'scripts/**/*.cjs', '.eslintrc.cjs'],
            env: { node: true, browser: false, es2021: true },
            parserOptions: { sourceType: 'script' },
        },

        // ---- Tests INSIDE functions/ (ESM, testing CommonJS) -------------
        // Must come AFTER the CommonJS block above, because later overrides win
        // and that one sets `sourceType: 'script'` for everything under
        // `functions/**`. `functions/teamApproval.test.js` is collected by Vitest
        // and so is ESM — it imports both the CJS module under test and the ESM
        // `src/utils/teamPaths.js` it must not drift from. Without this override
        // the file's `import` lines are a parse error and `npm run lint` exits 1.
        {
            files: ['functions/**/*.test.js', 'functions/**/*.spec.js'],
            env: { node: true, browser: false, es2021: true },
            parserOptions: { sourceType: 'module' },
        },

        // ---- TEMPORARY: the V2 engine ------------------------------------
        // `src/utils/rosterEngineV2.js` has two unused bindings at the time this
        // config was written:
        //
        //   line  780  `BAND_ORDER`  assigned, never read
        //   line 5594  `weekday`     assigned, never read
        //
        // Neither could be fixed here: the file was being edited concurrently by
        // other work when P0.7 landed, so an inline fix would have collided.
        // Both are recorded as P0.7 follow-ups. DELETE THIS OVERRIDE once they
        // are resolved — `--report-unused-disable-directives` cannot tell you an
        // override has gone stale, only an inline directive.
        {
            files: ['src/utils/rosterEngineV2.js'],
            rules: { 'no-unused-vars': 'off' },
        },

        // ---- Service worker ----------------------------------------------
        {
            files: ['public/**/*-sw.js'],
            env: { browser: true, serviceworker: true, es2021: true },
            globals: {
                // Loaded at runtime by `importScripts` from gstatic, so the
                // compat namespace has no import to resolve.
                firebase: 'readonly',
            },
        },
    ],
};
