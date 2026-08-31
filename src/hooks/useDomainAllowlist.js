/**
 * ==============================================================================
 * useDomainAllowlist — READS `config/domains` BEFORE ANYONE IS SIGNED IN
 * ==============================================================================
 *
 * The registration gate needs to know which institutions NEXUS serves, and it needs
 * to know BEFORE authentication — so this read is anonymous, and `firestore.rules`
 * grants `config/domains` a public read. A list of hospital domains is not a secret;
 * hiding it would only mean nobody could be told why they were refused.
 *
 * ⚠️ THE FAILURE PATH IS THE POINT OF THIS FILE. This read can fail — the visitor is
 * offline, the rules changed, the document was deleted. In every one of those cases
 * `domains` stays at `DEFAULT_ALLOWED_DOMAINS`, which is the two institutions
 * already in the live directory. It never widens to "allow anything" and it never
 * returns an empty list, because `isAllowedEmail([])` also falls back. A gate that
 * opens when its configuration cannot be read is not a gate.
 *
 * The error is deliberately NOT surfaced to the visitor. There is nothing they can
 * do about it, the fallback is correct for every current user, and a red banner on
 * the login screen of a clinical tool costs more than it buys. It is logged.
 */

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { configPath, CONFIG_DOCS } from '../utils/teamPaths';
import { DEFAULT_ALLOWED_DOMAINS, parseDomainAllowlist } from '../utils/accessPolicy';

export const useDomainAllowlist = () => {
    const [domains, setDomains] = useState(DEFAULT_ALLOWED_DOMAINS);
    const [loaded, setLoaded] = useState(false);
    /**
     * ⚠️ `configured` IS NOT `domains.length > 0` — it can never be, because
     *    `domains` always has a value. It answers a different question: did the
     *    `config/domains` DOCUMENT actually yield a list, or are we running on the
     *    built-in fallback?
     *
     *    WHY THAT DISTINCTION EARNS A SECOND RETURN VALUE. The fallback keeps the
     *    LOGIN screen working — existing users must get in even if the document is
     *    missing — but `inviteMember` on the server has the opposite rule and
     *    refuses everybody when the document is empty or unreadable. Both are right
     *    (see the function's own note). The consequence is a state where somebody
     *    can register and then cannot be added to a team, and nothing said why: the
     *    owner hit exactly that on 2026-08-31 and the message they got read as
     *    "your hospital is refused".
     *
     *    So the fact is exposed, and the SURFACE decides what to do with it. The
     *    login screen still says nothing — see the header, that reasoning stands.
     *    The team panel, where a lead is about to press Add and it will fail, says
     *    so before they do.
     */
    const [configured, setConfigured] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const read = async () => {
            try {
                const snapshot = await getDoc(doc(db, ...configPath(CONFIG_DOCS.domains)));
                const parsed = snapshot.exists() ? parseDomainAllowlist(snapshot.data()) : null;
                if (cancelled) return;
                if (parsed) setDomains(parsed);
                // Absent, empty, or unparseable all mean the same thing to the server.
                setConfigured(Boolean(parsed));
            } catch (error) {
                // Fall back rather than fail — see the header. Logged, not shown.
                console.warn('[NEXUS] config/domains unreadable; using the built-in allowlist.', error);
                // Unreadable is NOT "configured": the server will refuse invitations
                // for the same reason we could not read it.
                if (!cancelled) setConfigured(false);
            } finally {
                if (!cancelled) setLoaded(true);
            }
        };

        read();
        return () => { cancelled = true; };
    }, []);

    return { domains, loaded, configured };
};

export default useDomainAllowlist;
