/**
 * ==============================================================================
 * CLINICAL ANSWER PARSER — `AC5`: exported, imported, and finally unit-testable
 * ==============================================================================
 *
 * This lived inside `AuraChat.jsx` as a module-level `const` that was never
 * exported — so the four test files that name `AuraChat` all read the FILE AS
 * TEXT and asserted on regexes, because importing the component drags in jsPDF
 * and html2canvas. Source scanning proves a string is present; it cannot prove
 * a number is right, which is `AC5` and is how `AC1`, `AC2` and `AC15` survived
 * inside eleven untested lines for weeks.
 *
 * Everything word-level lives in `clinicalFlags.js` (tested); everything
 * postal lives in `postalSectors.js` (tested). This module is the ASSEMBLY —
 * which raw answer feeds which parser, and what the result object is called —
 * and now the assembly is testable too. The body moved VERBATIM from
 * `AuraChat.jsx`; the annotations moved with it because they are about these
 * lines, not about the chat.
 */
import { toSector } from './singapore/postalSectors';
import {
  matchesSymptom, matchesCondition, matchesFinancialBarrier, matchesSocialIsolation,
  matchesPsychologicalDistress, matchesCaregiverStrain, matchesFoodInsecurity,
  parseAgeBand,
  matchesFemale, matchesMale,
  isNoPreviousId, parseFallsAnswer, parseHealthierSg,
  parsePavsDays, parsePavsMinutes,
} from './clinicalFlags';

export const parseClinicalData = (raw) => {
  // PAVS — Q0 days, Q1 minutes
  const daysStr  = (raw.pavs_days || '').toLowerCase();
  const minsStr  = (raw.pavs_mins  || '').toLowerCase();

  /*
   * ⚠️ THE LADDER MOVED TO `clinicalFlags.js` AND IS NOW TESTED — `AC1` `AC2` `AC15`.
   *
   * It lived here, inside a module-level `const` that is not exported, so it could
   * not be unit-tested without a React tree. `COMMUNITY_TODO.md` P4.3 has had
   * "`parseClinicalData` has no tests" OPEN for weeks, and three defects sat in
   * these eleven lines the whole time:
   *
   *   AC1   `includes('20')` ate every three-digit answer containing "20", so a
   *         typed "120 minutes" scored 15 and a five-day two-hour exerciser was
   *         recorded at 75 min/wk and routed to a BEGINNER programme.
   *   AC2   the digit fallback meant "daily" scored 0 days and "about an hour"
   *         scored 0 minutes — CP1's defect, one layer upstream.
   *   AC15  `includes('60 min')` was tested FIRST, and "45–60 mins" contains it,
   *         so that tapped chip scored 65 where the form's table says 52.
   *
   * The parsers are pure, exported and asserted against `ConventionalForm`'s own
   * midpoint tables, so the two pathways cannot drift while they remain separate.
   */
  const daysN = parsePavsDays(daysStr);
  const minsN = parsePavsMinutes(minsStr);

  const pavsScore    = Math.round(daysN * minsN); 
  const pavsDays     = daysN;
  const pavsMinutes  = daysN === 0 ? 0 : minsN;

  // Strength
  const strStr      = (raw.strength || '').toLowerCase();
  const strengthDays = strStr.includes('3+') ? 3
                     : strStr.includes('2')   ? 2
                     : strStr.includes('1')   ? 1
                     : 0;

  // Medical safety
  const medStr      = (raw.medical || '').toLowerCase();
  const symptomFlag = matchesSymptom(medStr);
  const medFlag     = matchesCondition(medStr);

  // SDOH — Financial
  const barrStr      = (raw.barriers || '').toLowerCase();
  const sdohFinancial = matchesFinancialBarrier(barrStr);

  // SDOH — Social 
  const socialStr    = (raw.social || '').toLowerCase();
  const sdohSocial   = matchesSocialIsolation(socialStr);

  // SDOH — Psychological 
  const wellStr      = (raw.wellbeing || '').toLowerCase();
  const sdohPsychological = matchesPsychologicalDistress(wellStr);
  // Its own domain as well as a distress signal — see `matchesCaregiverStrain`.
  const caregiverStrain   = matchesCaregiverStrain(wellStr);

  // Falls & function — asked of the 60+ cohort only, so `asked: false` here means
  // "not applicable or not translated", NEVER "no falls".
  const falls = parseFallsAnswer(raw.falls);
  // `null` for both "not sure" and "not asked" — the portal does not know, and
  // that must not be read as "not enrolled".
  const healthierSgEnrolled = parseHealthierSg(raw.healthier_sg);

  // Demographics
  const demoStr = (raw.demographics || '').toLowerCase();
  let gender = 'Unknown';
  // Female is tested first because `male` is a substring of `female`; the
  // matchers are word-bounded now, but the order is load-bearing for the
  // non-Latin terms and is kept deliberately.
  if (matchesFemale(demoStr))       gender = 'Female';
  else if (matchesMale(demoStr))    gender = 'Male';

  // ⚠️ ONE PARSER, SHARED WITH THE FALLS GATE AND THE FORM. This was three
  //    `includes` calls that only recognised the chip text, so a typed age became
  //    `Unknown` — losing the falls screen AND both 60+ CTA tiers, since
  //    `selectCTA` branches on this value.
  const age = parseAgeBand(demoStr);

  // NEW: Ethnicity & Housing Type
  const ethnicity = raw.ethnicity || 'Unknown';
  const housingType = raw.housing_type || 'Unknown';
  /**
   * ⚠️ THE FORM DERIVED THIS AND THE CHAT DID NOT — and nothing consumed it in
   *    either. The evidence page tells the public that housing is used as a social
   *    risk proxy ("1–2 Room HDB"), so it was a claim with no mechanism behind it,
   *    the same shape as the retention notice before `expireCommunityAssessments`.
   *    Now derived in both pathways and routed in `communityServices.js`.
   */
  const sdohHousing = /1-2 room|1–2 room/i.test(housingType);

  // Location
  // ⚠️ A REAL SECTOR OR `null` — NEVER '00'. `toSector` validates against the 81
  //    live Singapore sectors and rejects anything that is not a postal code, so a
  //    chip label, a typo or a refusal all come back as `null` and stay unknown all
  //    the way to the result. The old code produced the string '00', which is not a
  //    sector, and the cluster lookup resolved it to one particular cluster as
  //    though it were a place.
  const postalSector = toSector(raw.postal_code);

  // Continuity
  const foodStr        = (raw.food_insecurity || '').toLowerCase();
  const sdohFoodInsecure = matchesFoodInsecurity(foodStr);

  const prevStr    = (raw.previous_id || '');
  const isNoId     = isNoPreviousId(prevStr);
  const previousId = isNoId ? null : prevStr.trim().toUpperCase();

  return {
    pavsScore, pavsDays, pavsMinutes, strengthDays,
    symptomFlag, medFlag,
    sdohFinancial, sdohSocial, sdohPsychological, sdohFoodInsecure,
    caregiverStrain, sdohHousing,
    fallsCount: falls.falls, fallsRisk: falls.fallsRisk,
    fearOfFalling: falls.avoidsActivity, fallsAsked: falls.asked,
    healthierSgEnrolled,
    gender, age, ethnicity, housingType, postalSector, previousId,
    psychoFlag: sdohPsychological,
  };
};
