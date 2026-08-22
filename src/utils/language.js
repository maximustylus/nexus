/**
 * ==============================================================================
 * LANGUAGE — one key, and the `lang` attribute that has to follow it
 * ==============================================================================
 *
 * The portal serves four languages. It stored the choice in
 * `localStorage.nexus_language` and re-read it independently in four components,
 * each keeping its own `useState` copy — but nothing ever told the DOCUMENT.
 * `index.html` declared `lang="en"` and never changed it.
 *
 * ⚠️ WHY THAT IS NOT COSMETIC. `<html lang>` is what a screen reader uses to
 *    choose its pronunciation rules. Left at `en`, VoiceOver and TalkBack read
 *    Bahasa Melayu, 中文 and தமிழ் aloud using English phonetics — which for
 *    Tamil and Chinese is not an accent, it is unintelligible. On a public health
 *    screening built for a population that explicitly includes elderly and
 *    non-English-first users, the assistive path is the one that most needed to
 *    work. It also affects hyphenation, font fallback and, on some browsers, the
 *    offer to translate the page.
 *
 * So the write goes through here, and setting the attribute is not optional or
 * separate — `writeLanguage` does both, so a future caller cannot set one and
 * forget the other. That is the whole reason this is a module rather than two
 * lines in `LanguageGate`.
 */

export const LANGUAGE_KEY = 'nexus_language';

/** The four the portal actually ships. Anything else is treated as absent. */
export const SUPPORTED = ['en', 'ms', 'zh', 'ta'];

export const DEFAULT_LANGUAGE = 'en';

/**
 * `document.documentElement.lang`, kept in step with the stored choice.
 * Exported so a caller that already has the value can apply it without a
 * round-trip through storage — every screen does this on mount.
 */
export const applyDocumentLanguage = (lang) => {
    const value = SUPPORTED.includes(lang) ? lang : DEFAULT_LANGUAGE;
    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.lang = value;
    }
    return value;
};

/**
 * Reads the stored choice, falling back to English. Wrapped because Safari in
 * private mode THROWS on `localStorage` access rather than returning null, and an
 * uncaught throw here takes the whole render down to a blank page — the screens
 * that read this key do so during render.
 */
export const readLanguage = () => {
    try {
        const stored = localStorage.getItem(LANGUAGE_KEY);
        return SUPPORTED.includes(stored) ? stored : DEFAULT_LANGUAGE;
    } catch {
        return DEFAULT_LANGUAGE;
    }
};

/** Stores the choice AND updates the document. Never one without the other. */
export const writeLanguage = (lang) => {
    const value = applyDocumentLanguage(lang);
    try {
        localStorage.setItem(LANGUAGE_KEY, value);
    } catch {
        /* Private mode. The attribute is set; only persistence is lost. */
    }
    return value;
};
