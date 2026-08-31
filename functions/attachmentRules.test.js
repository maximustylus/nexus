/**
 * `AU15`/`AU17` — the bounds on the one field that used to have none but a count.
 * Pure module, so every branch is exercised without credentials or a deploy.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const {
    MAX_ATTACHMENTS,
    MAX_ATTACHMENT_CHARS,
    MAX_ATTACHMENT_TOTAL_CHARS,
    ALLOWED_ATTACHMENT_TYPES,
    checkAttachments,
    attachmentAuditFields,
} = require_('./attachmentRules.cjs');

const pdf = (chars = 100) => ({ mimeType: 'application/pdf', data: 'A'.repeat(chars) });

describe('checkAttachments — the accept side', () => {
    it('accepts the absent field, which is every current client', () => {
        expect(checkAttachments(undefined)).toEqual({ ok: true });
    });

    it('accepts an empty array and a full allowed set', () => {
        expect(checkAttachments([]).ok).toBe(true);
        expect(checkAttachments(ALLOWED_ATTACHMENT_TYPES.map(
            (mimeType) => ({ mimeType, data: 'QUJD' }),
        )).ok).toBe(true);
    });

    it('accepts padded and unpadded base64', () => {
        expect(checkAttachments([{ mimeType: 'text/plain', data: 'QUJDRA==' }]).ok).toBe(true);
        expect(checkAttachments([{ mimeType: 'text/plain', data: 'QUJD' }]).ok).toBe(true);
    });

    it('accepts a file exactly at the per-attachment ceiling', () => {
        expect(checkAttachments([pdf(MAX_ATTACHMENT_CHARS)]).ok).toBe(true);
    });
});

describe('checkAttachments — the refuse side, each with a sentence', () => {
    it.each([
        ['a non-array', 'not an array', /must be an array/],
        ['null in the list', [null], /mimeType and base64/],
        ['a missing mimeType', [{ data: 'QUJD' }], /mimeType and base64/],
        ['a missing data', [{ mimeType: 'application/pdf' }], /mimeType and base64/],
        ['empty data', [{ mimeType: 'application/pdf', data: '' }], /mimeType and base64/],
        ['a non-string mimeType', [{ mimeType: 42, data: 'QUJD' }], /mimeType and base64/],
    ])('refuses %s', (_label, value, message) => {
        const verdict = checkAttachments(value);
        expect(verdict.ok).toBe(false);
        expect(verdict.message).toMatch(message);
    });

    it('refuses a sixth attachment', () => {
        const six = Array.from({ length: MAX_ATTACHMENTS + 1 }, () => pdf());
        expect(checkAttachments(six)).toEqual({
            ok: false,
            message: `Maximum ${MAX_ATTACHMENTS} attachments allowed per request.`,
        });
    });

    it.each([
        ['an executable', 'application/x-msdownload'],
        ['a zip', 'application/zip'],
        ['svg, which can carry script', 'image/svg+xml'],
        ['html', 'text/html'],
        ['a case variant of an allowed type', 'APPLICATION/PDF'],
        ['an allowed type with a parameter', 'application/pdf; charset=utf-8'],
    ])('refuses %s — the allowlist is exact-match', (_label, mimeType) => {
        const verdict = checkAttachments([{ mimeType, data: 'QUJD' }]);
        expect(verdict.ok).toBe(false);
        expect(verdict.message).toContain('is not accepted');
    });

    it('truncates a hostile mimeType in its own error message', () => {
        const verdict = checkAttachments([{ mimeType: 'x'.repeat(500), data: 'QUJD' }]);
        expect(verdict.ok).toBe(false);
        expect(verdict.message.length).toBeLessThan(250);
    });

    it.each([
        ['whitespace', 'QUJD\nRA=='],
        ['a data: prefix', 'data:application/pdf;base64,QUJD'],
        ['base64url alphabet', 'QUJ-_A'],
        ['padding in the middle', 'QU=JD'],
    ])('refuses %s as not-base64', (_label, data) => {
        // base64url is refused on purpose: Gemini's inlineData takes standard
        // encoding, so passing it here would fail later at the billed API.
        const verdict = checkAttachments([{ mimeType: 'application/pdf', data }]);
        expect(verdict.ok).toBe(false);
        expect(verdict.message).toMatch(/base64/);
    });

    it('refuses one file over the per-attachment ceiling, naming megabytes', () => {
        const verdict = checkAttachments([pdf(MAX_ATTACHMENT_CHARS + 1)]);
        expect(verdict.ok).toBe(false);
        expect(verdict.message).toMatch(/exceeds the 4 MB limit/);
    });

    it('refuses a request whose files are individually fine but jointly over', () => {
        // Three files just under the per-file cap: 3 × ~4MB > the ~8MB total.
        const three = [pdf(MAX_ATTACHMENT_CHARS), pdf(MAX_ATTACHMENT_CHARS), pdf(MAX_ATTACHMENT_CHARS)];
        const verdict = checkAttachments(three);
        expect(verdict.ok).toBe(false);
        expect(verdict.message).toMatch(/together exceed the 8 MB limit/);
    });
});

describe('the ceilings encode the reasoning', () => {
    it('per-file is ~4 MB of file and total is twice that', () => {
        expect(Math.floor((MAX_ATTACHMENT_CHARS * 3) / 4 / 1048576)).toBe(4);
        expect(MAX_ATTACHMENT_TOTAL_CHARS).toBe(MAX_ATTACHMENT_CHARS * 2);
    });

    it('the allowlist is papers and page images, nothing executable or scriptable', () => {
        expect(ALLOWED_ATTACHMENT_TYPES).toEqual([
            'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain',
        ]);
    });
});

describe('attachmentAuditFields — shape, never content (AU17)', () => {
    it('records count, types and sizes only', () => {
        const fields = attachmentAuditFields([
            { mimeType: 'application/pdf', data: 'QUJDRA==' },
            { mimeType: 'image/png', data: 'QUJD' },
        ]);
        expect(fields).toEqual({
            count: 2,
            types: ['application/pdf', 'image/png'],
            base64Chars: [8, 4],
        });
    });

    it('never includes the data itself', () => {
        const fields = attachmentAuditFields([{ mimeType: 'text/plain', data: 'U0VDUkVU' }]);
        expect(JSON.stringify(fields)).not.toContain('U0VDUkVU');
    });
});
