/**
 * ==============================================================================
 * LEAD DECLARATION — the three fields, in one place
 * ==============================================================================
 *
 * Institution, department and profession: what somebody claiming to run a team has
 * to say before an administrator can approve them.
 *
 * ── ⚠️ WHY THIS IS A COMPONENT AND NOT JSX IN TWO SCREENS ────────────────────
 *
 * It is asked in two places now, and they are reached by different people at
 * different moments:
 *
 *   · `WelcomeScreen` — at registration, by somebody who knows they run a team
 *     and ticks the box.
 *   · `AccessGate` — later, by somebody who registered as staff and turns out to
 *     lead a department. Before this existed they had no route at all: the
 *     declaration was written inside the sign-up handler and nowhere else, so
 *     registering without the box ticked left them `awaiting-invite` for ever,
 *     with a screen offering "Check again" and "Sign out".
 *
 * The VALIDATION and the WRITE SHAPE were already shared — `validateLeadDeclaration`
 * and `buildLeadRequest` in `accessPolicy.js`. Only the inputs were duplicated, and
 * duplicated inputs are how a fourth field gets added to one screen and not the
 * other: the request then validates, writes, and is missing something an approver
 * needs, from one door and not the other. This repository has that failure
 * already, under `CP9`, and does not need a second one.
 *
 * Presentational and fully controlled. It holds no state, performs no write, and
 * knows nothing about Firestore — the two callers own all of that, because they
 * disagree about what happens next: one is creating an account, the other is
 * amending an existing one.
 */

import React from 'react';
import { MOH_PROFESSION_OPTIONS } from '../data/mockData';

const INPUT = 'w-full bg-white dark:bg-[#1f2937] border border-slate-200 dark:border-slate-700 '
    + 'shadow-sm rounded-xl py-4 px-4 text-xs font-bold text-slate-900 dark:text-white outline-none '
    + 'focus:ring-2 focus:ring-indigo-500 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600';

/** One field's error, styled so it sits under its own input rather than in a summary. */
const FieldError = ({ message }) => (message ? (
    <p className="mt-1 text-[10px] font-bold text-red-600 dark:text-red-400">{message}</p>
) : null);

const LeadDeclarationFields = ({
    institution, onInstitution,
    department, onDepartment,
    profession, onProfession,
    errors = {},
    disabled = false,
}) => (
    <div className="space-y-4">
        <div>
            <input
                type="text"
                placeholder="Institution — e.g. KKH"
                aria-label="Institution"
                className={INPUT}
                value={institution}
                disabled={disabled}
                onChange={(e) => onInstitution(e.target.value)}
            />
            <FieldError message={errors.institution} />
        </div>

        <div>
            <input
                type="text"
                placeholder="Department or service — e.g. Respiratory Therapy"
                aria-label="Department or service"
                className={INPUT}
                value={department}
                disabled={disabled}
                onChange={(e) => onDepartment(e.target.value)}
            />
            <FieldError message={errors.department} />
        </div>

        <div>
            {/*
              MOH's own vocabulary, already in the tree for the demo picker. Two of
              the 28 professions nest, so this walks groups and options rather than a
              flat list — a browser will not let anyone select a group heading, which
              is the behaviour we want and would otherwise have to enforce ourselves.
            */}
            <select
                aria-label="Profession"
                value={profession}
                disabled={disabled}
                onChange={(e) => onProfession(e.target.value)}
                className={INPUT}
            >
                <option value="">Profession…</option>
                {MOH_PROFESSION_OPTIONS.map((entry) => (entry.kind === 'group' ? (
                    <optgroup key={entry.groupId} label={entry.label}>
                        {entry.options.map((leaf) => (
                            <option key={leaf.id} value={leaf.id}>{leaf.name}</option>
                        ))}
                    </optgroup>
                ) : (
                    <option key={entry.id} value={entry.id}>{entry.name}</option>
                )))}
            </select>
            <FieldError message={errors.profession} />
        </div>
    </div>
);

export default LeadDeclarationFields;
