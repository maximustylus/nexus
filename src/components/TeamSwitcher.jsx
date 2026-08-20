/**
 * ==============================================================================
 * TEAM SWITCHER
 * ==============================================================================
 *
 * Renders NOTHING for the overwhelming majority of users, who belong to exactly one
 * team forever. A control that only ever offers one option is furniture that has to
 * be read and dismissed on every visit, and this app already asks enough of a
 * clinician's attention.
 *
 * For the minority who do span departments — a roster master covering two services,
 * a supervisor across sites — this is the most consequential control on the screen:
 * every roster, swap and wellbeing record below it changes meaning when it changes.
 * So it is a native `<select>` with the team named in full, not an icon or an
 * abbreviation. Someone glancing up mid-edit must be able to answer "whose roster am
 * I looking at?" without clicking anything.
 */

import React from 'react';
import { Users } from 'lucide-react';
import { useTeam } from '../context/TeamContext';
import { teamLabel } from '../utils/teamSelection';

const TeamSwitcher = ({ className = '' }) => {
    const { teams, teamId, switchTeam, showSwitcher } = useTeam();

    if (!showSwitcher) return null;

    return (
        <label className={`flex items-center gap-2 ${className}`}>
            <span className="sr-only">Active team</span>
            <Users size={16} className="text-slate-400 shrink-0" aria-hidden="true" />
            <select
                value={teamId || ''}
                onChange={(event) => switchTeam(event.target.value)}
                aria-label="Active team"
                // `min-h-[44px]` and `text-sm` rather than the app's usual `text-[10px]`
                // chrome sizing: this is a control that changes what every number on
                // screen means, and iOS Safari zooms the page for any font under 16px.
                className="min-h-[44px] max-w-[16rem] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
            >
                {teams.map((team) => (
                    <option key={team.id} value={team.id}>{teamLabel(team)}</option>
                ))}
            </select>
        </label>
    );
};

export default TeamSwitcher;
