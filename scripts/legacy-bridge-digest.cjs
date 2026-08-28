#!/usr/bin/env node
'use strict';

/**
 * Regenerates the digest rows in `src/utils/legacyBridge.js`.
 *
 * Usage:  node scripts/legacy-bridge-digest.cjs someone@kkh.com.sg role "Title"
 *
 * Prints the row; pasting it is deliberate — this table changing should be rare
 * enough to be a reviewed diff, not an automated write. If you find yourself
 * running this often, the bridge has outlived its trigger and should be deleted
 * instead (see the header of legacyBridge.js).
 *
 * ⚠️ The email goes in as an ARGUMENT and comes out as a DIGEST. Do not commit
 *    the command line anywhere (shell history is fine; CI logs are not).
 */

const { createHash } = require('node:crypto');

const SALT = 'nexus-legacy-bridge-v1|';
const [email, role, title] = process.argv.slice(2);

if (!email || !role || !title) {
    console.error('usage: node scripts/legacy-bridge-digest.cjs <email> <role> "<title>"');
    process.exit(1);
}

const digest = createHash('sha256').update(SALT + email.trim().toLowerCase()).digest('hex');
console.log(`    ['${digest}', { role: '${role}', title: '${title}' }],`);
