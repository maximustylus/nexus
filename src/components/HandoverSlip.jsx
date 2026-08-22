import React from 'react';
import { sectorInfo } from '../utils/singapore/postalSectors';
import { servicesForSector } from '../utils/singapore/communityServices';
import { RETENTION_MONTHS_LABEL } from '../utils/retentionLabel';

/**
 * ==============================================================================
 * HANDOVER SLIP — one page, on paper, for somebody who leaves without a phone
 * ==============================================================================
 *
 * A Regional Health System reviewer's ask: "Not everyone leaves with a phone. A
 * one-page printable output an AAC or Social Service Office will accept."
 *
 * The portal's only output was a jsPDF download, which needs a device that can
 * hold and later find a PDF — and rasterises the page through html2canvas, so
 * even that is a picture of text rather than text. The population this tool exists
 * to reach is the least likely to be served by either.
 *
 * ── ⚠️ THIS IS NOT A REFERRAL, AND IT SAYS SO IN BOLD ────────────────────────
 *
 * NEXUS is anonymous by design: no name, no NRIC, no contact, and no record that
 * can be looked up. So a centre receiving this slip CANNOT verify it, cannot
 * retrieve anything behind it, and has not been told the person is coming.
 *
 * A one-page document with a reference number, a risk band and a health service's
 * name on it will be READ as a referral unless it very plainly says it is not.
 * That misleads two people at once: the resident, who believes they are expected,
 * and the centre, which believes somebody clinical has assessed them. The slip
 * therefore leads with what it is — a self-completed summary the person is
 * carrying — and repeats it at the foot.
 *
 * If the consent model ever changes to allow identified referral, THIS is the
 * component that gains a real reference and loses the disclaimer. Until then the
 * disclaimer is the honest half of the feature.
 *
 * ── WHY PRINT CSS RATHER THAN ANOTHER PDF ────────────────────────────────────
 *
 * `window.print()` reaches a real printer, a "Save as PDF" in every browser's
 * print dialogue, and a screen reader — because it stays TEXT. The existing
 * download does none of those things. It also adds no dependency: the slip is
 * ordinary markup that `@media print` reveals and everything else hides.
 */

const Row = ({ label, children }) => (
  <div className="slip-row">
    <div className="slip-row-label">{label}</div>
    <div className="slip-row-value">{children}</div>
  </div>
);

const HandoverSlip = ({ score, riskTier, data = {}, postalSector, sessionId, formattedDate }) => {
  const place = sectorInfo(postalSector);
  const { services } = servicesForSector(postalSector, data);

  const flags = [
    data.symptomFlag       && 'Chest pain or dizziness on exertion',
    data.medFlag           && 'Ongoing health condition reported',
    data.fallsRisk         && (data.fearOfFalling
                                ? 'Fall in the past 12 months, and now avoiding some activities'
                                : 'Fall in the past 12 months'),
    data.caregiverStrain   && 'Unpaid caregiving strain',
    data.sdohPsychological && 'Psychological distress',
    data.sdohSocial        && 'Limited social support',
    data.sdohFinancial     && 'Cost or distance is a barrier',
    data.sdohFoodInsecure  && 'Food insecurity reported',
    data.healthierSgEnrolled === false && 'Not enrolled with a Healthier SG GP',
  ].filter(Boolean);

  return (
    <div className="handover-slip" aria-hidden="true">
      <header className="slip-head">
        <div>
          <h1 className="slip-title">Community health summary</h1>
          <p className="slip-sub">NEXUS · self-completed screening</p>
        </div>
        <div className="slip-meta">
          <div><strong>Ref</strong> {sessionId}</div>
          <div><strong>Date</strong> {formattedDate}</div>
        </div>
      </header>

      {/*
        ⚠️ FIRST, NOT LAST. A page with a reference number and a risk band on it is
        read as a referral within about two seconds. Whatever contradicts that has
        to arrive before the reader has decided.
      */}
      <p className="slip-notice">
        <strong>This is not a referral.</strong> The person completed this screening
        themselves, on a public website. Nobody clinical has reviewed it, no
        appointment has been made, and NEXUS holds no record that can be looked up —
        the assessment is anonymous and stores no name, NRIC or contact details.
        Please treat it as what the person is telling you about themselves.
      </p>

      <section className="slip-body">
        <Row label="Where">
          {place ? `${place.locality} · Sector ${place.sector}, District ${place.district}` : 'Not provided'}
        </Row>
        <Row label="Activity">
          {Number.isFinite(Number(data.pavsScore))
            ? `${data.pavsScore} minutes per week reported${Number(data.pavsScore) < 150 ? ' — below the 150 min/week guideline' : ''}`
            : 'Not provided'}
        </Row>
        <Row label="Screening band">
          {riskTier} ({score} points) — an internal banding, not a diagnosis
        </Row>
        <Row label="Reported">
          {flags.length > 0
            ? <ul className="slip-list">{flags.map((f) => <li key={f}>{f}</li>)}</ul>
            : 'Nothing flagged'}
        </Row>
      </section>

      <section className="slip-services">
        <h2 className="slip-h2">Services this points to</h2>
        <ul className="slip-list">
          {services.map((s) => (
            <li key={s.id}>
              <strong>{s.label}</strong> — {s.blurb}
              <div className="slip-url">{s.finderLabel}: {s.finder}</div>
            </li>
          ))}
        </ul>
      </section>

      <footer className="slip-foot">
        <p>
          <strong>Not medical advice.</strong> This summary does not constitute a
          diagnosis or a treatment plan. Anyone reporting chest pain, dizziness or
          any acute symptom should be directed to a GP or polyclinic, and to
          emergency care if symptoms are severe or sudden.
        </p>
        <p>
          Not a referral · no record is held that can be retrieved · the anonymous
          assessment behind this page is deleted after {RETENTION_MONTHS_LABEL}.
        </p>
      </footer>
    </div>
  );
};

export default HandoverSlip;
