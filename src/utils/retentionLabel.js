/**
 * The retention period as it appears to a person.
 *
 * ⚠️ The authoritative number is `RETENTION_MONTHS` in `functions/retention.cjs`,
 *    which is what actually deletes records, and a test asserts the two agree. This
 *    file exists only because the client bundle must not import from `functions/` —
 *    that directory is CommonJS, has its own dependency tree, and is deployed
 *    separately.
 */
export const RETENTION_MONTHS_LABEL = '24 months';
