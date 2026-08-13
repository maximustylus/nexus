// src/version.js
//
// THE ONE PLACE THE APP LEARNS ITS OWN VERSION.
//
// `CHANGELOG.md` has always said it: "Single source of truth for the app version
// is `package.json` `version`." Nothing enforced it, so two hand-typed literals
// drifted and BOTH were visible on the deployed site at the same time — the
// sandbox banner said `v1.41-OFFICIAL` and the landing footer said `System
// v1.52`, while `package.json` said `1.12.0`. Three different answers to "which
// version is this?", none of them agreeing, on a site being shown to other
// departments.
//
// Reading `package.json` makes the drift structurally impossible rather than a
// thing to remember: `npm version` bumps one file and every surface follows.
//
// WHY AN IMPORT AND NOT A VITE `define`: this repo has no `vite.config.js` at
// all — the build runs on Vite's defaults, and esbuild transforms `.jsx`
// natively. Introducing a build config just to inject a string would put the
// app's build under a file that did not exist before, and a `define` is invisible
// to `vitest.config.js`, so every test rendering these components would have to
// learn about it too. A plain import needs no config, behaves identically in the
// build and under test, and Rollup tree-shakes the JSON's other keys away — the
// bundle carries the version string, not the dependency list. Verified in the
// built bundle, not assumed.
//
// The AURA ENGINE version is deliberately NOT here. It tracks the agent's
// capability tier, moves independently of the app version, and lives with the
// engine. Two different things that both happen to be called "version" is
// exactly how they end up wrongly coupled.

import { version } from '../package.json';

/** The raw semver string, e.g. `1.13.0`. */
export const APP_VERSION = version;

/** How the version is written in the UI, e.g. `v1.13.0`. One prefix, one place. */
export const APP_VERSION_LABEL = `v${version}`;
