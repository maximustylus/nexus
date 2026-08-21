/**
 * ==============================================================================
 * TEAM GATE — SUPPLIES THE PROVIDER WITH WHOSE TEAMS TO LOAD
 * ==============================================================================
 *
 * `TeamProvider` deliberately takes a `uid` as a prop rather than reaching for
 * Firebase itself: that is what lets `TeamContext.test.jsx` drive it with no auth
 * mock and assert the exact paths it composes. Something still has to supply that
 * uid in the real app, and this is it — the smallest possible adapter.
 *
 * ── WHY IT SITS ABOVE `App`, NOT INSIDE IT ───────────────────────────────────
 *
 * The first wiring put `<TeamProvider>` in `App`'s own return, which meant `App`
 * was the provider's PARENT and so could not call `useTeam()` — while being exactly
 * the component that needs `teamId` for the dashboard, the loads and the
 * notification bell. The alternative was splitting a 900-line component in two
 * purely to move a hook call.
 *
 * Mounting the provider one level up in `main.jsx` costs nothing and makes the team
 * available to every screen including `App` itself.
 *
 * ⚠️ SIGNED OUT MEANS `null`, NOT "WAIT". A visitor on the public portal and a
 *    sandbox visitor both legitimately have no uid, and `TeamProvider` treats null
 *    as "subscribe to nothing" rather than as an error — so the portal pays for no
 *    reads and `useTeam()` returns an inert context there.
 */

import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { TeamProvider } from './TeamContext';

export const TeamGate = ({ children }) => {
    const [uid, setUid] = useState(() => auth.currentUser?.uid || null);

    useEffect(() => auth.onAuthStateChanged((user) => setUid(user?.uid || null)), []);

    return <TeamProvider uid={uid}>{children}</TeamProvider>;
};

export default TeamGate;
