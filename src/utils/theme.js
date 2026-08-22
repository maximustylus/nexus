/**
 * ==============================================================================
 * THEME KEY — one name for the setting, because there were two
 * ==============================================================================
 *
 * `ConventionalForm.jsx`'s own header records the split as "FIX 1 — Theme key:
 * nexus_theme → nexus-theme (hyphen)", reasoning that "AuraChatbot uses hyphen".
 * The change was applied to three files. Four others were not, including
 * `App.jsx`, which is the shell that actually toggles `documentElement.classList`
 * for the entire application:
 *
 *   nexus_theme   App.jsx · WelcomeScreen · LanguageGate · PathwaySelection
 *   nexus-theme   ConventionalForm · AuraChat · ResultPage
 *
 * So the fix did not unify the setting, it split the product in half along the
 * pathway gate: a person picks dark on `/individuals/language`, taps through to
 * the form, and it comes up light.
 *
 * `nexus_theme` wins because the shell owns the class on `<html>` and three of
 * the four writers already use it — the smaller move, and it does not touch
 * `App.jsx`.
 *
 * `readTheme` still LOOKS AT THE OLD KEY as a fallback so that anybody who set
 * dark mode inside the community flow before this change keeps it. Nothing
 * writes the hyphen key any more, so the fallback ages out on its own.
 */

export const THEME_KEY = 'nexus_theme';

/** The key three community screens wrote between "FIX 1" and this module. */
const LEGACY_THEME_KEY = 'nexus-theme';

/**
 * `null` means "no stored preference" — distinct from "stored light". Callers
 * fall back to `prefers-color-scheme` on `null`, and must not treat it as light.
 * Wrapped because Safari private mode throws on `localStorage` access.
 */
export const readTheme = () => {
    try {
        return localStorage.getItem(THEME_KEY) ?? localStorage.getItem(LEGACY_THEME_KEY);
    } catch {
        return null;
    }
};

export const writeTheme = (isDark) => {
    try {
        localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    } catch {
        /* Private mode. The class on <html> is already set; only persistence is lost. */
    }
};
