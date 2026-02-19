// src/knowledgeBase.js

// 1. JOB DESCRIPTIONS (Synthesized from JG11 to JG16 Allied Health Framework)
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

ROLE: PRINCIPAL CLINICAL EXERCISE PHYSIOLOGIST (JG15) - [Deputy Head / Advanced Specialist]
- PRIMARY GOAL: Departmental leadership, clinical governance, and driving organizational goals.
- CLINICAL: Highly specialized consultant for the most complex, multi-morbid cases. Leads clinical governance.
- ADMIN: Manages high-level department budgets, oversees Quality Assurance (QA) frameworks, leads strategic planning for service expansion.
- RESEARCH: Secures national-level research grants. Primary author on high-impact publications.
- EDUCATION: Directs clinical training programs at an institutional level. Adjunct university faculty. Mentors JG13 and JG14 staff.

ROLE: SENIOR PRINCIPAL CLINICAL EXERCISE PHYSIOLOGIST (JG16) - [Head of Department / Director]
- PRIMARY GOAL: National-level leadership, shaping allied health policies, and executive management.
- CLINICAL: Minimal direct patient care; focuses on advising national clinical guidelines and steering committees.
- ADMIN: Executive leadership over multiple services/teams. Accountable for financial KPIs, strategic growth, and overall department performance.
- RESEARCH: Leads multi-center or international research collaborations.
- EDUCATION: Shapes national curriculum and credentialing for the profession.
`;

// 2. IDEAL TIME ALLOCATION
export const TIME_MATRIX = `
JG11 (Entry):    80% Clinical | 10% Admin |  5% Edu |  5% Research
JG12 (Comp):     70% Clinical | 15% Admin | 10% Edu |  5% Research
JG13 (Lead):     50% Clinical | 20% Admin | 15% Edu | 15% Research
JG14 (Snr):      30% Clinical | 40% Admin | 15% Edu | 15% Research
JG15 (Princ):    15% Clinical | 50% Admin | 15% Edu | 20% Research
JG16 (Snr Princ): 5% Clinical | 65% Admin | 15% Edu | 15% Research

RULE: If a JG14 is doing >50% Clinical work, flag as "Resource Misalignment".
RULE: If a JG11 is doing >20% Admin, flag as "Burnout Risk" (Scope Creep).
RULE: If a JG15 or JG16 is doing >20% Clinical work, flag as "Executive Bottleneck" (Failure to delegate).
`;

// 3. COMPETENCY FRAMEWORK
export const COMPETENCY_FRAMEWORK = `
DOMAIN: CLINICAL KNOWLEDGE
- Level 1: Knows standard ACSM guidelines. Can identify contraindications.
- Level 2: Modifies protocols for special populations (e.g., Down Syndrome).
- Level 3: Recognized expert. Consulted by doctors for rare diseases.
- Level 4: Drives clinical governance and writes institutional clinical protocols.
- Level 5: National Key Opinion Leader (KOL). Authors national clinical guidelines.

DOMAIN: TECHNICAL SKILLS
- Level 1: Operate metabolic cart & treadmill. Basic calibration.
- Level 2: Troubleshoot sensor errors. Perform biological verification.
- Level 3: Evaluate new technologies for purchase. Manage lab accreditation.
- Level 4: Pioneers the adoption of novel technologies across departments.
- Level 5: Shapes national tech-adoption strategies for allied health.

DOMAIN: LEADERSHIP & MANAGEMENT
- Level 1: Manage own time and tasks.
- Level 2: Lead small teams (e.g., QI project group).
- Level 3: Strategic vision. Change management. Conflict resolution.
- Level 4: Manages department-wide budgets and leads multiple sub-teams.
- Level 5: Executive management. Financial accountability for cross-institutional services.
`;

// 4. CAREER PATH PROGRESSION
export const CAREER_PATH = `
PROMOTION CRITERIA (JG11 -> JG12):
- Minimum 2 years clinical experience. Competent in all Level 1 Technical Skills.

PROMOTION CRITERIA (JG12 -> JG13):
- Minimum 4-5 years experience. Masters degree preferred. 
- Evidence of leading at least 1 successful QI project and student supervision.

PROMOTION CRITERIA (JG13 -> JG14):
- Minimum 8+ years experience. Track record of research output (posters/papers).
- Proven ability to manage budgets, KPIs, and teams.

PROMOTION CRITERIA (JG14 -> JG15):
- Minimum 12+ years experience. PhD or Advanced Masters preferred.
- Secured major national grants. Leadership over multiple teams/services.

PROMOTION CRITERIA (JG15 -> JG16):
- Outstanding track record of institutional/national leadership.
- Demonstrated ability to shape policy, execute executive-level strategy, and manage large-scale financial accountability.
`;
