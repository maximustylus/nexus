// src/knowledgeBase.js

// 1. JOB DESCRIPTIONS (Synthesized from JG11, JG12, JG13, JG14 DOCX files)
export const JOB_DESCRIPTIONS = `
ROLE: CLINICAL EXERCISE PHYSIOLOGIST III (JG11) - [Entry Level]
- PRIMARY GOAL: Deliver safe clinical services under supervision.
- CLINICAL: Perform standard CPET, spirometry, and 6MWT. Conduct exercise sessions for low-risk patients.
- ADMIN: Equipment calibration, daily lab preparation, basic data entry.
- RESEARCH: Assist in data collection (e.g., entering data into Excel).
- EDUCATION: Attend in-service talks; no teaching responsibilities.

ROLE: CLINICAL EXERCISE PHYSIOLOGIST II (JG12) - [Competent]
- PRIMARY GOAL: Independent clinical management and student preceptorship.
- CLINICAL: Independently interpret CPET and spirometry. Manage complex/chronic disease patients. Trouble-shoot equipment issues.
- ADMIN: Manage specific lab inventories (consumables).
- RESEARCH: Assist in literature reviews and simple data analysis.
- EDUCATION: Precept/supervise interns and junior students. Conduct basic patient education.

ROLE: CLINICAL EXERCISE PHYSIOLOGIST I (JG13) - [Lead/Specialist]
- PRIMARY GOAL: Service development and specialized clinical leadership.
- CLINICAL: Handle high-risk/complex cases (e.g., congenital heart disease). Develop new clinical protocols.
- ADMIN: Lead Quality Improvement (QI) projects. Roster management.
- RESEARCH: Co-investigator in trials. Present findings at local conferences.
- EDUCATION: Develop training curriculum for juniors. Lead journal clubs.

ROLE: SENIOR CLINICAL EXERCISE PHYSIOLOGIST (JG14) - [Principal/Manager]
- PRIMARY GOAL: Strategic direction, manpower planning, and external leadership.
- CLINICAL: Consultant for difficult cases.
- ADMIN: Department budgeting, manpower requisition, performance appraisal (KPIs), policy making.
- RESEARCH: Principal Investigator (PI) for major grants. Publish papers.
- EDUCATION: University lecturer/examiner. Mentor for JG13 staff.
`;

// 2. IDEAL TIME ALLOCATION (Derived from "Time Matrix.csv")
// The AI uses this to flag "Burnout" or "Role Mismatch".
export const TIME_MATRIX = `
JG11 (Entry): 80% Clinical | 10% Admin | 5% Edu | 5% Research
JG12 (Comp):  70% Clinical | 15% Admin | 10% Edu | 5% Research
JG13 (Lead):  50% Clinical | 20% Admin | 15% Edu | 15% Research
JG14 (Snr):   30% Clinical | 40% Admin | 15% Edu | 15% Research

RULE: If a JG14 is doing >50% Clinical work, flag as "Resource Misalignment".
RULE: If a JG11 is doing >20% Admin, flag as "Burnout Risk" (Scope Creep).
`;

// 3. COMPETENCY FRAMEWORK (Synthesized from "Competency Mapping.csv" & "GLF.csv")
// The AI uses this to calculate "Promotion Readiness".
export const COMPETENCY_FRAMEWORK = `
DOMAIN: CLINICAL KNOWLEDGE
- Level 1: Knows standard ACSM guidelines. Can identify contraindications to exercise.
- Level 2: Can modify protocols for special populations (e.g., Down Syndrome, CP).
- Level 3: Recognized expert. Consulted by doctors for exercise prescription in rare diseases.

DOMAIN: TECHNICAL SKILLS
- Level 1: Operate metabolic cart & treadmill. Basic calibration.
- Level 2: Troubleshoot sensor errors. Perform biological verification.
- Level 3: Evaluate new technologies for purchase. Manage lab accreditation safety.

DOMAIN: LEADERSHIP & MANAGEMENT
- Level 1: Manage own time and tasks.
- Level 2: Lead small teams (e.g., project group). Resolve interpersonal conflicts.
- Level 3: Strategic vision. Change management. Crisis management.
`;

// 4. CAREER PATH PROGRESSION (Derived from "Career Path.csv")
export const CAREER_PATH = `
PROMOTION CRITERIA (JG11 -> JG12):
- Minimum 2 years clinical experience.
- Competent in all Level 1 Technical Skills.
- Positive feedback from supervisors.

PROMOTION CRITERIA (JG12 -> JG13):
- Minimum 4-5 years experience.
- Masters degree preferred.
- Evidence of leading at least 1 successful QI project.
- Evidence of student supervision.

PROMOTION CRITERIA (JG13 -> JG14):
- Minimum 8+ years experience.
- Track record of research output (posters/papers).
- Proven ability to manage budgets and teams.
`;
