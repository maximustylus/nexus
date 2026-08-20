/**
 * ==============================================================================
 * TEAM SELECTION — WHICH TEAM THE CURRENT VIEW BELONGS TO
 * ==============================================================================
 *
 * Once a clinician can belong to more than one team, every screen in NEXUS has an
 * unspoken argument: *which team's roster is this?* This module is where that
 * argument is decided, and it is pure so the decision can be tested rather than
 * inferred from watching the app.
 *
 * ── THE PROPERTY EVERYTHING ELSE RESTS ON ────────────────────────────────────
 *
 * ⚠️ THE ACTIVE TEAM MUST ALWAYS BE ONE THE USER IS ACTUALLY A MEMBER OF. Never a
 * remembered id, never a value from the URL, never whatever was in `localStorage`.
 * That store is user-editable: typing a different team id into it must not aim the
 * app at another department's data. `firestore.rules` will deny the READ — but a
 * WRITE composed under the wrong team is the failure this whole rebuild exists to
 * prevent, and "the rules would have caught it" is not a design.
 *
 * So `resolveActiveTeam` filters against membership last, after every other input,
 * and `canActOn` is the single predicate anything that writes must consult.
 *
 * ── WHY REMEMBERING MATTERS ──────────────────────────────────────────────────
 *
 * A roster master in two departments opens NEXUS several times a day. Landing on
 * whichever team sorts first each time is a small, constant tax, and the mistake it
 * causes — editing the right-looking roster of the wrong team — is expensive and
 * quiet. So a valid previous choice always wins over a default.
 */

/** No team could be chosen: the user belongs to none, or none survived validation. */
export const NO_TEAM = null;

const isUsableId = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * The user's teams, cleaned and ordered. Sorted so that "the first team" means the
 * same thing on every device and every load — an unsorted default is a default that
 * changes when Firestore returns the array in a different order, which reads to the
 * user as the app forgetting their choice.
 */
export const normaliseTeamIds = (teamIds) => {
    if (!Array.isArray(teamIds)) return [];
    return [...new Set(teamIds.filter(isUsableId).map((id) => id.trim()))].sort();
};

/**
 * THE PREDICATE ANYTHING THAT WRITES MUST CONSULT. Deliberately boring and
 * deliberately not exported as part of a larger object — it should be trivial to
 * call, so there is no excuse for skipping it.
 */
export const canActOn = (teamId, teamIds) =>
    isUsableId(teamId) && normaliseTeamIds(teamIds).includes(teamId.trim());

/**
 * Decide the active team, in strict precedence order:
 *
 *   1. `previous` — a choice already made this session. Keeping it is what stops a
 *      re-render or a membership refresh from silently moving somebody to a
 *      different department mid-edit.
 *   2. `stored` — the last choice from a previous session (`localStorage`).
 *   3. the first team the user belongs to, deterministically ordered.
 *   4. `NO_TEAM`.
 *
 * Every candidate is checked against membership before it is returned, so an
 * invalid `previous` or a tampered `stored` falls through to the next rule instead
 * of being honoured.
 */
export const resolveActiveTeam = ({ teamIds, stored, previous } = {}) => {
    const available = normaliseTeamIds(teamIds);
    if (available.length === 0) return NO_TEAM;

    if (canActOn(previous, available)) return previous.trim();
    if (canActOn(stored, available)) return stored.trim();
    return available[0];
};

/**
 * Whether a switcher is worth rendering at all. Most people are in exactly one team
 * forever, and a control that only ever offers one option is furniture that has to
 * be read and dismissed on every visit.
 */
export const needsSwitcher = (teamIds) => normaliseTeamIds(teamIds).length > 1;

/**
 * A team document reduced to what a header or a switcher needs. Written here rather
 * than inline so that a team whose fields are missing renders SOMETHING nameable
 * instead of an empty chip — a blank team name looks like a loading bug and sends
 * people to the wrong screen looking for the cause.
 */
export const teamLabel = (team) => {
    if (!team || typeof team !== 'object') return '';
    const department = typeof team.department === 'string' ? team.department.trim() : '';
    const institution = typeof team.institution === 'string' ? team.institution.trim() : '';
    const name = typeof team.name === 'string' ? team.name.trim() : '';

    const primary = department || name;
    if (primary && institution) return `${primary} — ${institution}`;
    if (primary) return primary;
    if (institution) return institution;
    return typeof team.id === 'string' ? team.id : '';
};

export const LAST_TEAM_KEY = 'nexus_active_team';
