import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Users, ShieldAlert, MapPin, TrendingUp, EyeOff } from 'lucide-react';
import { POSTAL_SECTORS, REGION_LABEL } from '../utils/singapore/postalSectors';

/**
 * ==============================================================================
 * COMMUNITY INSIGHTS — the population view, and what it refuses to show
 * ==============================================================================
 *
 * The portal has written an assessment for every member of the public who
 * completed one, and until now nothing read a single one. A Regional Health System
 * reviewer named the cost: *"you are already collecting the data and reading none
 * of it… that is what justifies my budget line."*
 *
 * ── ⚠️ THIS SCREEN CANNOT REACH A RECORD, BY CONSTRUCTION ────────────────────
 *
 * It reads ONE document — `community_insights/latest` — which a scheduled
 * Admin-SDK function writes with counts only. `community_assessments` remains
 * `allow read: if false` for every client, permanently: `CP5` found it readable by
 * every signed-in staff member and closed it, and a dashboard that reopened it
 * would undo that fix for the sake of a chart.
 *
 * So there is no query here, no filter that could widen, and no path from this
 * component to a respondent. That is not a restriction on the feature — it IS the
 * feature.
 *
 * ── ⚠️ SUPPRESSION IS SHOWN, NOT HIDDEN ─────────────────────────────────────
 *
 * Sectors below the disclosure threshold are withheld, and this screen says how
 * many and how many people they represent. A suppressed map that looked complete
 * would be read as a map of zero need, and planning would follow the gaps in the
 * data rather than the gaps in provision. The withheld people are still counted in
 * their region and nationally, and the screen says that too.
 */

const DOMAIN_LABELS = {
  exertionalSymptoms: 'Chest pain or dizziness on exertion',
  chronicCondition: 'Ongoing health condition',
  belowActivityTarget: 'Below 150 min/week',
  psychologicalDistress: 'Psychological distress',
  caregiverStrain: 'Unpaid caregiving strain',
  socialIsolation: 'Limited social support',
  financialBarrier: 'Cost or distance a barrier',
  foodInsecurity: 'Food insecurity',
  housingRisk: '1–2 room HDB',
  fallsRisk: 'Fall in past 12 months (60+)',
  notEnrolledHealthierSg: 'Not enrolled with Healthier SG',
};

const Stat = ({ icon: Icon, label, value, tone = 'slate' }) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4">
    <div className="flex items-center gap-2 mb-1">
      <Icon size={13} className={`text-${tone}-500`} />
      <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{label}</p>
    </div>
    <p className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">{value}</p>
  </div>
);

/** A count, or the suppression band. Bands are styled so they read as withheld. */
const Count = ({ value }) =>
  typeof value === 'string'
    ? <span className="text-slate-400 italic" title="Withheld — below the disclosure threshold">{value}</span>
    : <span className="tabular-nums">{value}</span>;

const DomainTable = ({ title, rows, domainKeys }) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
      <h3 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">{title}</h3>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-slate-400">
            <th className="px-3 py-2 font-bold">Area</th>
            <th className="px-3 py-2 font-bold text-right">People</th>
            {domainKeys.map((k) => (
              <th key={k} className="px-3 py-2 font-bold text-right whitespace-nowrap">{DOMAIN_LABELS[k] || k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, tally]) => (
            <tr key={key} className="border-t border-slate-100 dark:border-slate-800">
              <td className="px-3 py-2 font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">{key}</td>
              <td className="px-3 py-2 text-right font-bold tabular-nums">{tally.respondents}</td>
              {domainKeys.map((k) => (
                <td key={k} className="px-3 py-2 text-right text-slate-600 dark:text-slate-400">
                  <Count value={tally.domains[k]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export default function CommunityInsightsPanel() {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  useEffect(() => {
    let live = true;
    getDoc(doc(db, 'community_insights', 'latest'))
      .then((snap) => {
        if (!live) return;
        // ⚠️ "No document yet" is NOT an error. The rollup is written nightly, so a
        //    fresh project has none — and showing a failure would send somebody to
        //    debug permissions when the answer is "wait until tomorrow".
        if (!snap.exists()) { setState({ status: 'empty', data: null, error: null }); return; }
        setState({ status: 'ready', data: snap.data(), error: null });
      })
      .catch((error) => { if (live) setState({ status: 'error', data: null, error: error.message }); });
    return () => { live = false; };
  }, []);

  if (state.status === 'loading') {
    return <div className="p-8 text-sm text-slate-500">Loading community insights…</div>;
  }
  if (state.status === 'empty') {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-xl font-black text-slate-900 dark:text-white mb-2">Community insights</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          No rollup has been generated yet. It is written nightly by a scheduled
          function; if the portal has had no completions there will be nothing to
          show. This is not an error.
        </p>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-xl font-black text-slate-900 dark:text-white mb-2">Community insights</h1>
        <p className="text-sm text-rose-600 dark:text-rose-400">Could not load: {state.error}</p>
      </div>
    );
  }

  const d = state.data;
  const domainKeys = d.domainKeys || Object.keys(DOMAIN_LABELS);
  const sectorRows = Object.entries(d.sectors || {}).map(([sector, tally]) => {
    const info = POSTAL_SECTORS[sector];
    return [info ? `${sector} · ${info.locality.split(' · ')[0]}` : sector, tally];
  });
  const regionRows = Object.entries(d.regions || {})
    .map(([region, tally]) => [REGION_LABEL[region] || region, tally]);

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-xl font-black text-slate-900 dark:text-white">Community insights</h1>
        <p className="text-xs text-slate-400 mt-1">
          Counts only · generated {d.generatedAt ? new Date(d.generatedAt).toLocaleString('en-GB') : 'unknown'}
        </p>
      </div>

      {/*
        ⚠️ FIRST, NOT IN A FOOTNOTE. Anyone reading a population figure needs to
        know what it excludes before they read it, not after they have planned
        from it.
      */}
      <div className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4">
        <div className="flex items-start gap-2">
          <EyeOff size={15} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 dark:text-amber-100 leading-relaxed">
            <p className="font-bold mb-1">What this deliberately does not show</p>
            <p>
              These are counts. No individual assessment is readable by this screen or
              by any other — the underlying records are closed to every client and are
              deleted after 24 months.
            </p>
            <p className="mt-1.5">
              {/*
                ⚠️ THE FLOOR IS UNIFORM NOW, AND THE COPY HAS TO SAY SO. This used to
                promise that a withheld sector's people were "still counted in their
                region below" — true when only sectors were suppressed, and false as
                soon as a thin region is withheld too. The national total is the one
                place they are always counted, so that is what this now says.
              */}
              <strong>
                {d.suppression?.suppressedSectorCount ?? 0} sectors
                {(d.suppression?.suppressedRegions?.length ?? 0) > 0
                  && `, ${d.suppression.suppressedRegions.length} regions`}
                {(d.suppression?.suppressedPeriods?.length ?? 0) > 0
                  && `, ${d.suppression.suppressedPeriods.length} months`}
              </strong>{' '}
              are withheld because each had fewer than {d.suppression?.minCell ?? 10}{' '}
              respondents. Everyone withheld is still counted in the national total.
              Counts under {d.suppression?.minCount ?? 5} within a published area show
              as <em>{d.suppression?.band ?? '<5'}</em>. A blank area on this page means
              too few responses to publish, <strong>not</strong> no need.
            </p>
            {d.suppression?.nationalDomainsWithheld && (
              <p className="mt-1.5 font-bold">
                Fewer than {d.suppression?.minCell ?? 10} assessments in total, so even
                the national breakdown is withheld — with a handful of respondents the{' '}
                <em>{d.suppression?.band ?? '<5'}</em> band would describe individuals
                rather than a population.
              </p>
            )}
            {d.truncated && (
              <p className="mt-1.5 font-bold">
                ⚠️ This rollup was truncated at the read cap and describes a subset.
                Do not plan from it until the aggregation is paged.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={Users} label="Respondents" value={d.national?.respondents ?? 0} />
        <Stat icon={MapPin} label="Sectors published" value={Object.keys(d.sectors || {}).length} />
        <Stat icon={EyeOff} label="Sectors withheld" value={d.suppression?.suppressedSectorCount ?? 0} />
        <Stat icon={ShieldAlert} label="No location given" value={d.quality?.unlocatedRecords ?? 0} />
      </div>

      <DomainTable title="By region" rows={regionRows} domainKeys={domainKeys} />
      <DomainTable title="By postal sector" rows={sectorRows} domainKeys={domainKeys} />

      {Object.keys(d.periods || {}).length > 0 && (
        <DomainTable
          title="By month"
          rows={Object.entries(d.periods).map(([p, t]) => [p, t])}
          domainKeys={domainKeys}
        />
      )}

      <p className="text-[11px] text-slate-400 leading-relaxed max-w-3xl flex items-start gap-1.5">
        <TrendingUp size={12} className="shrink-0 mt-0.5" />
        <span>
          Records with no usable date are excluded from the monthly view and counted
          in <em>quality.undatedRecords</em> ({d.quality?.undatedRecords ?? 0}). Records
          with no usable postal sector are counted nationally but in no region — the
          people least able to give a postal code are not a rounding error.
        </span>
      </p>
    </div>
  );
}
