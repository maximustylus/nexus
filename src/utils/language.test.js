/**
 * ==============================================================================
 * LANGUAGE — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * `index.html` declared `lang="en"` and nothing ever changed it, on a portal
 * serving four languages. `<html lang>` is what a screen reader uses to pick its
 * pronunciation rules, so Tamil and Chinese were being read aloud with English
 * phonetics — not an accent, unintelligible — on the tool built for the people
 * most likely to be using a screen reader.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    LANGUAGE_KEY, SUPPORTED, DEFAULT_LANGUAGE,
    applyDocumentLanguage, readLanguage, writeLanguage,
} from './language';

beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'en';
});
afterEach(() => { vi.restoreAllMocks(); });

describe('applyDocumentLanguage', () => {
    it.each(SUPPORTED)('sets <html lang> to %s', (code) => {
        applyDocumentLanguage(code);
        expect(document.documentElement.lang).toBe(code);
    });

    /**
     * ⚠️ AN UNKNOWN CODE MUST NOT REACH THE ATTRIBUTE. `lang="xx"` is worse than
     *    `lang="en"`: a reader that cannot resolve it may fall back to the system
     *    voice rather than to English, so a bad value is not a harmless no-op.
     */
    it('falls back to English for anything unsupported', () => {
        ['xx', '', null, undefined, 'EN', 'en-SG', 42].forEach((junk) => {
            expect(applyDocumentLanguage(junk)).toBe(DEFAULT_LANGUAGE);
            expect(document.documentElement.lang).toBe(DEFAULT_LANGUAGE);
        });
    });
});

describe('writeLanguage — storage and the attribute move together', () => {
    /**
     * THE PROPERTY THE MODULE EXISTS FOR. The bug was that these were two separate
     * facts and only one of them was ever updated. A caller must not be able to
     * set the stored value without the document following.
     */
    it.each(SUPPORTED)('stores %s AND sets the attribute in one call', (code) => {
        writeLanguage(code);
        expect(localStorage.getItem(LANGUAGE_KEY)).toBe(code);
        expect(document.documentElement.lang).toBe(code);
    });

    it('normalises before storing, so a bad value cannot be persisted', () => {
        writeLanguage('klingon');
        expect(localStorage.getItem(LANGUAGE_KEY)).toBe(DEFAULT_LANGUAGE);
    });

    /**
     * Safari in private mode THROWS on localStorage rather than returning null.
     * These screens touch the key during render, so an uncaught throw takes the
     * page to blank — and it would do so for the visitor least likely to work out
     * why.
     */
    it('still sets the attribute when storage throws', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('QuotaExceededError');
        });
        expect(() => writeLanguage('ta')).not.toThrow();
        expect(document.documentElement.lang).toBe('ta');
    });
});

describe('readLanguage', () => {
    it('returns what was written', () => {
        writeLanguage('ms');
        expect(readLanguage()).toBe('ms');
    });

    it('defaults to English when nothing is stored', () => {
        expect(readLanguage()).toBe(DEFAULT_LANGUAGE);
    });

    it('ignores a stored value that is no longer supported', () => {
        localStorage.setItem(LANGUAGE_KEY, 'jp');
        expect(readLanguage()).toBe(DEFAULT_LANGUAGE);
    });

    it('does not throw when storage is unavailable', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new DOMException('SecurityError');
        });
        expect(() => readLanguage()).not.toThrow();
        expect(readLanguage()).toBe(DEFAULT_LANGUAGE);
    });
});

describe('the supported set', () => {
    it('is exactly the four the portal ships', () => {
        expect(SUPPORTED).toEqual(['en', 'ms', 'zh', 'ta']);
    });
});
