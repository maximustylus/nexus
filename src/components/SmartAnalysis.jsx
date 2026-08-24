import React, { useState, useRef } from 'react';
import { db } from '../firebase'; 
import * as firestore from 'firebase/firestore';
import { X, ShieldCheck, Sparkles, Upload, FileJson } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';

// 🛡️ IMPORT CONTEXT
import { useNexus } from '../context/NexusContext';
import { useTeam } from '../context/TeamContext';
import { useTeamGrades } from '../hooks/useTeamGrades';
import { professionLabel } from '../utils/memberProfile';
import { bandOfGrade } from '../utils/rosterEngineV2';
import { bandLabel } from '../utils/rosterWizard';
import { reportPath, projectStaffPath } from '../utils/teamPaths';

const functions = getFunctions(undefined, 'us-central1');
// 🛡️ CRITICAL FIX: 300,000ms (5 minutes) timeout to match the backend!
const generateSmartAnalysis = httpsCallable(functions, 'generateSmartAnalysis', { timeout: 300000 });

/**
 * ==============================================================================
 * ⚠️ `STAFF_PROFILES` AND `MARVEL_PROFILES` WERE HERE, AND THEIR DELETION IS THE
 *    MOST SERIOUS FIX IN THE AURA SET — `AN1`, `AN2`, `AN3`.
 * ==============================================================================
 *
 * `STAFF_PROFILES` was a module-level constant naming six real colleagues with
 * their roles and their JOB GRADES:
 *
 *     "Alif": { role: "Lead and Senior Clinical Exercise Physiologist", grade: "JG14" },
 *     "Fadzlynn": { …, grade: "JG13" },  "Derlinder": { …, grade: "JG12" },
 *     "Ying Xian": { …, grade: "JG12" }, "Brandon":   { …, grade: "JG11" }, …
 *
 * A constant in a React component is a constant in the BUNDLE. Measured:
 *
 *     $ grep -o 'grade:"JG1[0-9]"' dist/assets/index-p-*.js | sort | uniq -c
 *           2 JG11   2 JG12   2 JG13   2 JG14   1 JG15   1 JG16
 *
 * One bundle serves every route, including `/individuals` — so a member of the
 * public opening the community health screening downloaded six KKH clinicians'
 * names, roles and pay grades as part of the page. No sign-in, no Firestore read,
 * so no rule was involved and nothing in `firestore.rules` could have stopped it.
 *
 * ⚠️ IT UNDID THE WHOLE GRADE-PRIVACY MODEL WITH A `const`. That model — grade in
 *    its own collection, `allow list: if false` even to a lead, `useTeamGrades`
 *    lead-only, `useMemberGrade` one member at a time, grade never in the
 *    member-list render — is correct in every particular and was bypassed
 *    entirely by this file. `useTeamGrades`' own header says *"grep -rn
 *    useTeamGrades src/ is the complete list of places grades can reach"*. That
 *    sentence was true; the conclusion it invited was false.
 *
 * ⚠️ AND IT WAS `TEAM_DIRECTORY` AGAIN. The v2.0 rebuild existed to delete a
 *    hardcoded team from `src/utils/index.js` and from the rules. This copy was
 *    never found, because it spells grades `JG11`–`JG16` where the engine uses
 *    `AH7`–`AH17` — a second, older vocabulary that matches no search for the
 *    first.
 *
 * `MARVEL_PROFILES` went with it: it was already unreachable (the demo branch
 * returns a hardcoded report before any profile map is chosen) and carried an
 * `eslint-disable` saying so.
 *
 * ------------------------------------------------------------------------------
 * WHAT REPLACED THEM, AND TWO CHOICES INSIDE THAT
 * ------------------------------------------------------------------------------
 *
 * `analysisProfiles` below is built from the team's OWN members. Two decisions
 * worth stating rather than leaving to be inferred:
 *
 * ⚠️ 1. THE BAND IS SENT, NOT THE GRADE. A like-for-like replacement would have
 *       put `AH14` in the payload — and this payload goes to Gemini. Having just
 *       taken pay grades off colleagues' screens, sending them to a third party
 *       would be the same disclosure through a different door. `bandOfGrade` gives
 *       the model what a wellbeing audit actually needs — whether somebody carries
 *       senior responsibility — without the number. The published roster already
 *       implies the band; it has never implied the grade.
 *
 * ⚠️ 2. NO REFUSAL WHEN GRADES CANNOT BE READ. `RosterView` refuses to generate on
 *       `gradesDenied`, because an ungraded department produces a plausible and
 *       WRONG roster. Here an absent band costs a sentence of context in a report a
 *       human reads and edits. Degrading quietly is right for one and wrong for the
 *       other, and the difference is whether the output is acted on automatically.
 */

const SmartAnalysis = ({ teamData, staffLoads, onClose }) => {
    const { isDemo } = useNexus();
    const { teamId, team, members, isLead } = useTeam();
    // Lead-only, enforced by `firestore.rules`. `AN4` now makes the server agree
    // that only a lead may run this at all, so the two are consistent.
    const { grades } = useTeamGrades(teamId, members, !isDemo && !!teamId);
    const [targetYear, setTargetYear] = useState('2026'); 
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('GENERATE ANALYSIS');
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [importedData, setImportedData] = useState(null);
    const fileInputRef = useRef(null);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target.result);
                setImportedData(json);
                alert(`SUCCESS: Loaded bulk data from ${file.name}`);
            } catch (err) {
                alert("❌ ERROR: The file is not a valid JSON format.");
            }
        };
        reader.readAsText(file);
    };

    const handleAnalyze = async () => {
        setLoading(true); setError('');
        console.log("Starting Analysis for:", targetYear);
        
        try {
            // 🧪 🛡️ THE FIX: SANDBOX BYPASS
            // If we are in Demo Mode, DO NOT call Google Cloud. Just simulate it!
            if (isDemo) {
                setStatus('Simulating Neural Link with AURA...');
                
                // Wait 2.5 seconds to make it feel real
                await new Promise(resolve => setTimeout(resolve, 2500));
                
                // Return a perfectly formatted Marvel Report
                setResult({
                    private: "## Executive Summary\nPrivate: Peter (JG11) is experiencing severe scope creep and burnout risk. Reallocate his Inpatient Ward duties to Steve to balance clinical load across the department.\n\n## Executive Wins\n- **Steve:** Maintaining 100% on Shield Integration protocols.\n- **Charles:** Successfully securing the Mutant Genome research grant.\n\n## Risk Factors & Strategic Focus\n- **Burnout:** Peter's On-Call frequency has exceeded healthy parameters.\n- **Isolation:** Tony's remote Work-From-Home status is creating a silo effect. Schedule mandatory on-site check-ins.",
                    public: "## Team Summary\nPublic: The Marvel CEP Team is crushing Q1! Shield Integration is complete, and clinical targets are being met across the board. Excellent cross-departmental collaboration.\n\n## Team Wins\n- **Milestone:** Shield Integration Completed ahead of schedule.\n- **Clinical:** New Web Shooter operational protocols are now fully active.\n\n## Strategic Focus for Q2\n- Maintain clear communication channels during remote work rotations.\n- Continue to monitor high-volume ward capacities during peak periods.",
                    /**
                     * P1, and the sandbox is where it matters most. This report is
                     * fabricated: Peter, Steve and Charles are not colleagues and the
                     * figures are invented. Everything on this screen otherwise looks
                     * exactly like a real analysis, which is the point of a demo and
                     * also the risk in one, so the artefact says what it is.
                     */
                    assumptions: 'SANDBOX. Every name, figure and finding in this report is fabricated sample data. '
                        + 'No model was called and no departmental record was read. It demonstrates the format of the '
                        + 'report and nothing about any real person.',
                    provenanceFooter: 'Not AI-generated. Fixed sample text held in the application, shown because '
                        + 'the sandbox toggle is on.',
                });
                
                console.log("Mock AI Analysis Generated");
                return; // Stop here, do not execute the live code below!
            }

            // 🔌 LIVE MODE: Execute the real Google Cloud Function
            const sourceData = importedData || teamData || [];
            const filteredYearData = sourceData.map(staff => ({
                name: staff.staff_name || staff.name,
                projects: (staff.projects || []).filter(p => String(p.year || '2026') === String(targetYear))
            }));

            /**
             * The team's own people — `AN2`. This read `STAFF_PROFILES`, so EVERY
             * department's analysis was generated over the same six named
             * colleagues from one department, and `handlePublish` then archived it
             * to `teams/{teamId}/reports/{year}` where every member of the
             * publishing team can read it. A cross-tenant disclosure by
             * construction rather than by a loose rule.
             */
            const profileArray = (members || []).map((m) => {
                const band = grades[m.uid] ? bandOfGrade(grades[m.uid]) : null;
                return {
                    name: m.displayName || m.email || m.uid,
                    role: m.title || '',
                    profession: professionLabel(m.profession) || m.profession || '',
                    // The BAND, never the grade — see the note at the top of this file.
                    seniority: band ? bandLabel(band) : '',
                    rostered: m.rostered !== false,
                };
            });

            if (profileArray.length === 0) {
                throw new Error('This team has no members yet, so there is nothing to analyse.');
            }

            /**
             * ⚠️ CHECKED HERE SO THE REFUSAL IS NOT A MID-DEMO SURPRISE. `AN4` made
             *    the server require `role === 'lead'` on the membership document, and
             *    an earlier comment of mine claimed "`hasAdminAccess` already gates
             *    the screen to a lead". **It does not.** `App.jsx:459` is
             *    `isDemo || isLead || ADMIN_EMAILS.includes(email) || user?.role === 'admin'`
             *    — four disjuncts, three of which are true for people whose MEMBERSHIP
             *    role is not `'lead'`, including the two legacy admin addresses.
             *
             *    So somebody reaching this screen by the email path would have pressed
             *    GENERATE and received `permission-denied` from the callable, in front
             *    of an audience, on a feature that worked the day before. The server
             *    check is right and stays; this makes the client agree with it and say
             *    so in a sentence instead.
             */
            if (!isLead) {
                throw new Error(
                    'Only a team lead can generate the wellbeing analysis. Your account can '
                    + 'open this screen, but its membership role for this team is not lead.',
                );
            }

            // `AN6`: this said "up to 5 minutes". The server aborts the model call at 30s
            // (`functions/index.js:463`), so the promise was ten times the budget.
            setStatus('Analysing — this usually takes under a minute…');

            const response = await generateSmartAnalysis({
                targetYear: Number(targetYear),
                // `AN4` — the server re-reads membership from this and refuses a
                // caller who is not a lead of it. It is not a hint; it is the whole
                // authorization check, because the function runs on the Admin SDK
                // and never passes through `firestore.rules`.
                teamId,
                /**
                 * `AN3`. This was the literal string `"SSMC@KKH CEP Team"`, so the
                 * server prompt opened `TEAM IDENTITY: SSMC@KKH CEP Team` for every
                 * department — and `SMART_ANALYSIS_SYSTEM_PROMPT` explicitly
                 * instructs the model to *"identify the specific team"* and *"adapt
                 * your analysis to their specific function"*. It was tailoring to
                 * the wrong department, every time, for every team but one.
                 */
                teamName: team?.name || 'the department',
                staffProfiles: profileArray,
                yearData: filteredYearData,
                staffLoads: staffLoads 
            });

            setResult({
                private: response.data.private,
                public: response.data.public,
                /**
                 * P1 and Rule 12 (`AURA-GUARDRAILS.md`). The server always returns
                 * both: if the model omitted its assumptions block, `assumptions`
                 * carries `NO_ASSUMPTIONS_DECLARED`, which says the model declared
                 * nothing rather than claiming there was nothing to declare.
                 *
                 * The fallbacks are for a client running against functions deployed a
                 * few minutes earlier. Hosting and functions do not deploy atomically,
                 * and an undefined here would render the word "undefined" inside a
                 * clinical report.
                 */
                assumptions: response.data.assumptions
                    || 'Not returned by the server. This report states no limits on itself; treat its figures as unverified.',
                provenanceFooter: response.data.provenanceFooter
                    || 'The responding model was not recorded for this report.',
            });
            console.log("AI Analysis Received");
            
        } catch (err) {
            console.error("Analysis Error:", err);
            setError('Analysis Failed: ' + err.message);
        } finally {
            setLoading(false);
            setStatus('GENERATE ANALYSIS');
        }
    };

    const handlePublish = async () => {
        if (!result) return;

        /**
         * ⚠️ THE SANDBOX MUST NOT PUBLISH, AND THIS GUARD IS WHAT WAS MISSING.
         *
         * `handleAnalyze` above returns a HARDCODED Marvel report in demo mode —
         * Peter's burnout, Steve's Shield Integration — and then this function
         * wrote it straight into `teams/{teamId}/reports/{year}` and overwrote
         * every `projects/{year}/staff/{uid}` document with the demo team's data.
         * Every other write in this app is fenced by `if (isDemo)`; this one was
         * not, so a lead who flipped the demo toggle to show a colleague the tool
         * and pressed ARCHIVE replaced their department's real year-end report
         * with fiction. It reported SUCCESS and nothing on screen said otherwise.
         *
         * Checked BEFORE `teamId`, because the sandbox is the reason to refuse and
         * "No team selected" would be the wrong sentence for a demo user who has
         * one. It is also the right sentence for a demo user who has none — the
         * signed-in-with-no-team case the holding screen now admits to the sandbox.
         */
        if (isDemo) {
            alert('SANDBOX MODE: nothing was archived. The demo report is fabricated sample data, so publishing it would overwrite the real year-end report. Switch to Live to archive.');
            return;
        }

        setLoading(true);
        try {
            if (!teamId) throw new Error('No team selected.');
            const reportRef = firestore.doc(db, ...reportPath(teamId, targetYear));
            await firestore.setDoc(reportRef, {
                privateText: result.private,
                publicText: result.public,
                /**
                 * ⚠️ RULE 12: THE PROVENANCE HAS TO SURVIVE THE ARCHIVE, OR IT IS NOT
                 *    PROVENANCE. `AU16` was that nothing recorded which model answered.
                 *    Returning it from the callable and then dropping it here would
                 *    close the finding in the network tab and leave the year-end
                 *    document exactly as unreproducible as it was.
                 */
                assumptionsText: result.assumptions || '',
                aiProvenance: result.provenanceFooter || '',
                timestamp: new Date()
            });

            const dataToArchive = importedData || teamData || [];
            
            // ARCHIVED BY uid. The document id used to be a slug of the display
            // name, so archiving a renamed clinician created a SECOND archive row
            // under the new spelling and left the old one behind — two partial
            // histories for one person, in the year-end report nobody re-reads.
            // `staff.id` is the uid the dashboard listener already carries.
            const batchPromises = dataToArchive
                .filter(staff => !!staff.id)
                .map(staff => {
                    const staffRef = firestore.doc(db, ...projectStaffPath(teamId, targetYear, staff.id));
                    return firestore.setDoc(staffRef, {
                        staff_name: staff.staff_name || staff.name || 'unknown',
                        projects: staff.projects || [],
                        year: targetYear
                    });
                });

            await Promise.all(batchPromises);
            alert(`SUCCESS: Archived ${targetYear}!`);
            onClose(); 
        } catch (e) {
            alert("Archive Error: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[100] p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[95vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700">
                <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-8 flex justify-between items-center text-white shrink-0">
                    <div className="flex items-center gap-3">
                        <ShieldCheck size={28} />
                        <div>
                            {/* 🛡️ THE FIX: Renamed Header */}
                            <h2 className="text-2xl font-black tracking-tight uppercase">AURA Deep Audit</h2>
                            <p className="text-xs opacity-70 font-bold uppercase tracking-widest">Year {targetYear}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-full transition-colors"><X size={28} /></button>
                </div>

                <div className="p-8 overflow-y-auto flex-1 bg-slate-50/50 dark:bg-slate-900/50">
                    {!result ? (
                        <div className="flex flex-col items-center justify-center py-6 h-full">
                            <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 max-w-md w-full text-center">
                                <div className="mb-6">
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Select Analysis Year</label>
                                    <select value={targetYear} onChange={(e) => setTargetYear(e.target.value)} className="w-full text-center text-xl font-black text-indigo-600 bg-indigo-50 dark:bg-slate-900 border-2 border-indigo-100 dark:border-slate-700 rounded-xl py-3 focus:outline-none">
                                        <option value="2026">2026</option>
                                        <option value="2025">2025</option>
                                        <option value="2024">2024</option>
                                    </select>
                                </div>
                                <div className="mb-8 p-4 border border-dashed border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900/50">
                                    <input type="file" accept=".json" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
                                    <button onClick={() => fileInputRef.current.click()} className={`w-full py-3 flex items-center justify-center gap-2 text-xs font-bold rounded-lg transition-all ${importedData ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-white dark:bg-slate-800 text-slate-600 border border-slate-200 hover:border-indigo-400'}`}>
                                        {importedData ? <FileJson size={16} /> : <Upload size={16} />}
                                        {importedData ? 'DATA LOADED' : 'IMPORT BULK .JSON'}
                                    </button>
                                </div>
                                <button onClick={handleAnalyze} disabled={loading} className={`w-full py-4 text-white font-black rounded-xl uppercase transition-all flex items-center justify-center gap-2 ${isDemo ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800'}`}>
                                    {loading ? <Sparkles className="animate-spin" size={18} /> : null}
                                    {loading ? <span>{status}</span> : `Generate ${targetYear} Report`}
                                </button>
                                {error && <div className="mt-4 p-3 bg-red-50 text-red-600 text-xs font-bold rounded">{error}</div>}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border-2 border-indigo-500 shadow-sm">
                                <h3 className="text-xs font-black text-indigo-500 mb-2 uppercase">Private Brief ({targetYear})</h3>
                                <div className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 h-64 overflow-y-auto border border-slate-100 dark:border-slate-700 p-4 rounded-lg bg-slate-50 dark:bg-slate-900 shadow-inner">{result.private}</div>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-slate-200 dark:border-slate-700">
                                <h3 className="text-xs font-black text-slate-500 mb-2 uppercase">Team Pulse ({targetYear})</h3>
                                <div className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400 h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 p-4 rounded-lg bg-white dark:bg-slate-900 shadow-inner">{result.public}</div>
                            </div>
                            {/*
                              * P1. Not a footnote and not collapsed behind a toggle: the
                              * rule is that limits are stated in the open, and a
                              * disclosure nobody opens is the footnote it forbids.
                              */}
                            <div className="bg-amber-50 dark:bg-amber-900/20 p-6 rounded-2xl border border-amber-300 dark:border-amber-700">
                                <h3 className="text-xs font-black text-amber-700 dark:text-amber-400 mb-2 uppercase">Assumptions, gaps and unverified items</h3>
                                <div className="whitespace-pre-wrap text-sm text-amber-900 dark:text-amber-200">{result.assumptions}</div>
                            </div>
                            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 px-1">{result.provenanceFooter}</p>
                            <button onClick={handlePublish} className={`w-full py-4 text-white font-black rounded-xl shadow-lg uppercase transition-all ${isDemo ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                                PUBLISH TO {targetYear} ARCHIVE
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SmartAnalysis;
