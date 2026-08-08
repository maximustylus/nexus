/**
 * ==============================================================================
 * ROSTER WIZARD — THE SANDBOX'S GRADE-AWARE TABLES (presentation only)
 * ==============================================================================
 *
 * The three controls that replaced the sandbox wizard's two comma-separated
 * textareas:
 *
 *   1. `BandBoundaryEditor` — where junior/senior/principal are cut on the
 *      AH7–AH17 scale. It sits ABOVE both tables because everything below it
 *      resolves against it: move a boundary and the grade range beside every
 *      task's chips changes in the same keystroke.
 *   2. `StaffTable` — Name / Grade / FTE / Away.
 *   3. `TaskTable` — Task / Who may lead / Days / Co-lead?
 *
 * ⚠️ SANDBOX ONLY. `RosterView` renders this in place of the two textareas when
 * `isDemo` is true, and renders the textareas exactly as before when it is not.
 * Nothing in this file imports Firestore, and nothing in it can write anything.
 *
 * NO STATE LIVES HERE. Every row, every band bound and every error comes in as a
 * prop and every edit goes out as a callback, so the one source of truth is
 * `RosterView`'s state and the one validator is
 * `buildDemoRosterV2ConfigFromTables`. A local copy of a cell's value here would
 * be a second, divergent answer to "what will be generated".
 * ==============================================================================
 */

import React from 'react';
import { Plus, Trash2, ShieldAlert, Users, ClipboardList, Layers } from 'lucide-react';
import { GRADE_SCALE } from '../utils/rosterEngineV2';
import { BAND_NAMES, WEEKDAY_STRIP, bandLabel, describeBandRange } from '../utils/rosterWizard';

/** Shared cell chrome, so the three controls cannot drift apart visually. */
const CELL_INPUT =
    'w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none';
const TH = 'text-left font-bold uppercase text-[10px] text-slate-400 py-1 pr-2';
const ADD_ROW =
    'mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200 font-bold text-[10px] uppercase tracking-wider transition-colors';

/** A pressed/unpressed pill. `aria-pressed` is the state, not the styling. */
const Toggle = ({ pressed, onClick, label, title, ariaLabel }) => (
    <button
        type="button"
        onClick={onClick}
        aria-pressed={pressed}
        aria-label={ariaLabel}
        title={title}
        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border transition-colors ${
            pressed
                ? 'bg-emerald-600 border-emerald-600 text-white'
                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-emerald-400'
        }`}
    >
        {label}
    </button>
);

/** Per-row problems, on their own full-width line under the row they belong to. */
const RowErrors = ({ errors, colSpan }) => {
    const messages = Object.values(errors || {}).filter(Boolean);
    if (messages.length === 0) return null;
    return (
        <tr>
            <td colSpan={colSpan} className="pb-2">
                {messages.map((message) => (
                    <p
                        key={message}
                        className="text-[10px] font-bold text-red-600 dark:text-red-400 flex items-start gap-1"
                    >
                        <ShieldAlert size={11} className="shrink-0 mt-px" />
                        <span>{message}</span>
                    </p>
                ))}
            </td>
        </tr>
    );
};

// --- 1. BAND BOUNDARIES -------------------------------------------------------

/**
 * The department's cut of the AH scale, as six numbers.
 *
 * All six are editable, including junior's floor and principal's ceiling, and
 * that is deliberate: `validateGradeBands` refuses a partition with a gap or an
 * overlap and says exactly which grades would fall through, and a user who moves
 * a boundary to the wrong place should read THAT rather than have the editor
 * silently correct them. `reason` below is the validator's own string.
 */
export const BandBoundaryEditor = ({ inputs, onChange, reason }) => (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
            <Layers size={13} /> Grade bands
        </p>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mb-2">
            Where this department cuts the allied-health scale. Every task&apos;s
            {' '}<span className="font-bold">who may lead</span> below is resolved against these
            boundaries, so a change here changes the grade ranges shown there immediately.
        </p>

        <div className="space-y-1.5">
            {BAND_NAMES.map((band) => (
                <div key={band} className="flex items-center gap-2">
                    <span className="w-20 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {bandLabel(band)}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">AH</span>
                    <input
                        type="number"
                        min="7"
                        max="17"
                        step="1"
                        aria-label={`${bandLabel(band)} band lowest grade`}
                        value={inputs[band].min}
                        onChange={(e) => onChange(band, 'min', e.target.value)}
                        className={`${CELL_INPUT} w-16`}
                    />
                    <span className="text-[10px] font-bold text-slate-400">–&nbsp;AH</span>
                    <input
                        type="number"
                        min="7"
                        max="17"
                        step="1"
                        aria-label={`${bandLabel(band)} band highest grade`}
                        value={inputs[band].max}
                        onChange={(e) => onChange(band, 'max', e.target.value)}
                        className={`${CELL_INPUT} w-16`}
                    />
                </div>
            ))}
        </div>

        {reason && (
            <p className="mt-2 text-[10px] font-bold text-red-600 dark:text-red-400 flex items-start gap-1.5">
                <ShieldAlert size={12} className="shrink-0 mt-px" />
                <span>{reason}</span>
            </p>
        )}
    </div>
);

// --- 2. STAFF -----------------------------------------------------------------

/**
 * Name / Grade / FTE / Away.
 *
 * The grade dropdown's first option is BLANK and means "not recorded" — it is not
 * a default of AH7. Somebody with no grade recorded cannot lead a band-gated
 * task, and the engine says so by name in the warnings under the calendar. That
 * is the honest answer, and it is why there is no "assume junior" here.
 */
export const StaffTable = ({ rows, errors, onChange, onAdd, onRemove }) => (
    <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
            <Users size={13} /> Staff
        </p>

        <div className="overflow-x-auto">
            <table className="w-full text-xs">
                <thead>
                    <tr>
                        <th className={TH}>Name</th>
                        <th className={TH}>Grade</th>
                        <th className={TH}>FTE</th>
                        <th className={TH}>Away (YYYY-MM-DD)</th>
                        <th className="w-8" />
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => (
                        <React.Fragment key={row.id}>
                            <tr>
                                <td className="py-1 pr-2 align-top">
                                    <input
                                        type="text"
                                        aria-label={`Staff row ${index + 1} name`}
                                        value={row.name}
                                        placeholder={index === 0 ? 'e.g. Aisha Rahman' : ''}
                                        onChange={(e) => onChange(row.id, { name: e.target.value })}
                                        className={CELL_INPUT}
                                    />
                                    {/* Skills have no column — they arrive with the
                                        example department and are carried on the row.
                                        Shown read-only rather than hidden: the example's
                                        one unfillable slot exists BECAUSE only two people
                                        hold CPET, and an invisible constraint that causes
                                        a visible failure is exactly what this app is
                                        against. */}
                                    {row.skills?.length > 0 && (
                                        <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                            skills: {row.skills.join(' · ')}
                                        </p>
                                    )}
                                </td>
                                <td className="py-1 pr-2 align-top">
                                    <select
                                        aria-label={`Staff row ${index + 1} job grade`}
                                        value={row.grade}
                                        onChange={(e) => onChange(row.id, { grade: e.target.value })}
                                        className={CELL_INPUT}
                                    >
                                        <option value="">Not recorded</option>
                                        {GRADE_SCALE.map((grade) => (
                                            <option key={grade} value={grade}>{grade}</option>
                                        ))}
                                    </select>
                                </td>
                                <td className="py-1 pr-2 align-top">
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        aria-label={`Staff row ${index + 1} FTE`}
                                        value={row.fte}
                                        onChange={(e) => onChange(row.id, { fte: e.target.value })}
                                        className={`${CELL_INPUT} w-16`}
                                    />
                                </td>
                                <td className="py-1 pr-2 align-top">
                                    <input
                                        type="text"
                                        aria-label={`Staff row ${index + 1} away dates`}
                                        value={row.away}
                                        placeholder="2026-09-16, 2026-09-17"
                                        onChange={(e) => onChange(row.id, { away: e.target.value })}
                                        className={CELL_INPUT}
                                    />
                                </td>
                                <td className="py-1 align-top">
                                    <button
                                        type="button"
                                        aria-label={`Remove staff row ${index + 1}`}
                                        title="Remove this person"
                                        onClick={() => onRemove(row.id)}
                                        disabled={rows.length <= 1}
                                        className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </td>
                            </tr>
                            <RowErrors errors={errors[row.id]} colSpan={5} />
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>

        <button type="button" onClick={onAdd} className={ADD_ROW}>
            <Plus size={12} /> Add row
        </button>

        <p className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Leave a grade as <span className="font-bold">Not recorded</span> and AURA will keep that
            person out of every band-restricted lead slot and say so by name in the warnings — it will
            not guess a grade for them. FTE defaults to 1.0; a blank FTE is full time. Away is a
            comma-separated list of dates.
        </p>
    </div>
);

// --- 3. TASKS -----------------------------------------------------------------

/**
 * Task / Who may lead / Days / Co-lead?
 *
 * "Who may lead" is three chips, and the grade range beside them is recomputed
 * from the CURRENT band boundaries on every render — so the row says
 * `AH13–AH17`, not `Senior/Principal`, which is the thing a roster master
 * actually checks against a payslip.
 *
 * Co-lead is a yes/no toggle rather than a count on purpose: `downloadCSV` and
 * `downloadICS` render exactly one co-lead, so a second one would be assigned by
 * the engine and then silently dropped from the exports this sandbox is showing
 * off.
 */
export const TaskTable = ({ rows, errors, bands, onChange, onAdd, onRemove }) => {
    const toggleBand = (row, band) =>
        onChange(row.id, {
            leadBands: row.leadBands.includes(band)
                ? row.leadBands.filter((entry) => entry !== band)
                : BAND_NAMES.filter((entry) => entry === band || row.leadBands.includes(entry)),
        });

    const toggleDay = (row, day) =>
        onChange(row.id, {
            days: row.days.includes(day)
                ? row.days.filter((entry) => entry !== day)
                : [...row.days, day].sort((a, b) => a - b),
        });

    return (
        <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                <ClipboardList size={13} /> Tasks
            </p>

            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr>
                            <th className={TH}>Task</th>
                            <th className={TH}>Who may lead</th>
                            <th className={TH}>Days</th>
                            <th className={TH}>Co-lead?</th>
                            <th className="w-8" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => {
                            const range = describeBandRange(row.leadBands, bands);
                            return (
                                <React.Fragment key={row.id}>
                                    <tr>
                                        <td className="py-1 pr-2 align-top min-w-[8rem]">
                                            <input
                                                type="text"
                                                aria-label={`Task row ${index + 1} name`}
                                                value={row.name}
                                                placeholder={index === 0 ? 'e.g. Outpatient Clinic' : ''}
                                                onChange={(e) => onChange(row.id, { name: e.target.value })}
                                                className={CELL_INPUT}
                                            />
                                            {/* Carried from the example department, like
                                                staff skills above: no column, but never
                                                silently applied. */}
                                            {row.requiresSkill && (
                                                <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                                    needs skill: {row.requiresSkill}
                                                </p>
                                            )}
                                        </td>
                                        <td className="py-1 pr-2 align-top">
                                            <div className="flex flex-wrap gap-1">
                                                {BAND_NAMES.map((band) => (
                                                    <Toggle
                                                        key={band}
                                                        pressed={row.leadBands.includes(band)}
                                                        onClick={() => toggleBand(row, band)}
                                                        label={bandLabel(band)}
                                                        ariaLabel={`Task row ${index + 1}: ${bandLabel(band)} may lead`}
                                                    />
                                                ))}
                                            </div>
                                            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                                {row.leadBands.length === 0
                                                    ? 'any grade may lead'
                                                    : (range || 'band boundaries are invalid')}
                                            </p>
                                        </td>
                                        <td className="py-1 pr-2 align-top">
                                            <div className="flex flex-wrap gap-1">
                                                {WEEKDAY_STRIP.map(({ day, label }) => (
                                                    <Toggle
                                                        key={day}
                                                        pressed={row.days.includes(day)}
                                                        onClick={() => toggleDay(row, day)}
                                                        label={label}
                                                        ariaLabel={`Task row ${index + 1}: ${label}`}
                                                    />
                                                ))}
                                            </div>
                                        </td>
                                        <td className="py-1 pr-2 align-top">
                                            <Toggle
                                                pressed={row.coLead}
                                                onClick={() => onChange(row.id, { coLead: !row.coLead })}
                                                label={row.coLead ? 'Yes' : 'No'}
                                                ariaLabel={`Task row ${index + 1}: co-lead`}
                                                title="One co-lead alongside the lead"
                                            />
                                        </td>
                                        <td className="py-1 align-top">
                                            <button
                                                type="button"
                                                aria-label={`Remove task row ${index + 1}`}
                                                title="Remove this task"
                                                onClick={() => onRemove(row.id)}
                                                disabled={rows.length <= 1}
                                                className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </td>
                                    </tr>
                                    <RowErrors errors={errors[row.id]} colSpan={5} />
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <button type="button" onClick={onAdd} className={ADD_ROW}>
                <Plus size={12} /> Add row
            </button>

            {/* The top surprise in the engine's limits ledger, said out loud where
                the surprise would happen. */}
            <p className="mt-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-relaxed">
                Ticking two bands makes both equally eligible — it is not a preference order.
            </p>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Bands gate the <span className="font-bold">lead</span> only: anyone may co-lead, which
                is what makes a band-gated task a supervision pairing rather than a closed shop.
            </p>
        </div>
    );
};

/** The three controls in their decided order: boundaries, then staff, then tasks. */
const RosterDemoWizardTables = ({
    bandInputs,
    bandsReason,
    bands,
    onBandChange,
    staffRows,
    staffErrors,
    onStaffChange,
    onStaffAdd,
    onStaffRemove,
    taskRows,
    taskErrors,
    onTaskChange,
    onTaskAdd,
    onTaskRemove,
}) => (
    <div className="space-y-4">
        <BandBoundaryEditor inputs={bandInputs} onChange={onBandChange} reason={bandsReason} />
        <StaffTable
            rows={staffRows}
            errors={staffErrors}
            onChange={onStaffChange}
            onAdd={onStaffAdd}
            onRemove={onStaffRemove}
        />
        <TaskTable
            rows={taskRows}
            errors={taskErrors}
            bands={bands}
            onChange={onTaskChange}
            onAdd={onTaskAdd}
            onRemove={onTaskRemove}
        />
    </div>
);

export default RosterDemoWizardTables;
