// JG11-JG16 Sandbox Data: Marvel Universe Edition

// 1. The Names List (CRITICAL for Universe Switching)
export const MOCK_STAFF_NAMES = ['Steve', 'Peter', 'Charles', 'Jean', 'Tony'];

// 2. The Staff Profiles
export const MOCK_STAFF = [
  { id: 'demo_01', name: 'Steve', grade: 'JG14', role: 'Senior Principal', workload: 92, battery: 75, domain: 'Clinical' },
  { id: 'demo_02', name: 'Peter', grade: 'JG11', role: 'Junior', workload: 105, battery: 45, domain: 'Inpatient' }, 
  { id: 'demo_03', name: 'Charles', grade: 'JG16', role: 'Master Expert', workload: 60, battery: 90, domain: 'Research' },
  { id: 'demo_04', name: 'Jean', grade: 'JG13', role: 'Principal', workload: 85, battery: 60, domain: 'Education' },
  { id: 'demo_05', name: 'Tony', grade: 'JG15', role: 'Tech Lead', workload: 40, battery: 95, domain: 'Management' }
];

// 3. The Projects (Combined 2026 + Archive History)
export const MOCK_PROJECTS = [
  // === 2026 (CURRENT DASHBOARD) ===
  { id: 'p1', title: 'Avenger Protocol v2', status: 'In Progress', lead: 'Steve', progress: 65, domain: 'Clinical', year: '2026' },
  { id: 'p2', title: 'Web Shooter Analysis', status: 'Stuck', lead: 'Peter', progress: 10, domain: 'Clinical', year: '2026' },
  { id: 'p3', title: 'Mutant Genome Study', status: 'Review', lead: 'Charles', progress: 90, domain: 'Research', year: '2026' },
  { id: 'p4', title: 'X-Mansion Curriculum', status: 'Planning', lead: 'Jean', progress: 15, domain: 'Education', year: '2026' },
  { id: 'p5', title: 'Ultron Defense Grid', status: 'Working', lead: 'Tony', progress: 40, domain: 'Management', year: '2026' },
  { id: 'p6', title: 'Shield Integration', status: 'Completed', lead: 'Steve', progress: 100, domain: 'Service', year: '2026' },

  // === 2025 (ARCHIVE) ===
  { id: 'a25_1', title: 'Operation: Rebirth', status: 'Completed', lead: 'Steve', progress: 100, domain: 'Clinical', year: '2025' },
  { id: 'a25_2', title: 'Nano-Tech Upgrade', status: 'Completed', lead: 'Tony', progress: 100, domain: 'Research', year: '2025' },
  { id: 'a25_3', title: 'Young Avengers Mentorship', status: 'Completed', lead: 'Peter', progress: 100, domain: 'Education', year: '2025' },
  { id: 'a25_4', title: 'Cerebro Maintenance', status: 'Completed', lead: 'Charles', progress: 100, domain: 'Management', year: '2025' },

  // === 2024 (ARCHIVE) ===
  { id: 'a24_1', title: 'Sentinels Defense Pact', status: 'Completed', lead: 'Charles', progress: 100, domain: 'Management', year: '2024' },
  { id: 'a24_2', title: 'Phoenix Force Analysis', status: 'Completed', lead: 'Jean', progress: 100, domain: 'Research', year: '2024' },
  { id: 'a24_3', title: 'Vibranium Supply Chain', status: 'Completed', lead: 'Tony', progress: 100, domain: 'Service', year: '2024' },
  { id: 'a24_4', title: 'Daily Bugle PR Campaign', status: 'Completed', lead: 'Peter', progress: 100, domain: 'Management', year: '2024' },

  // === 2023 (ARCHIVE) ===
  { id: 'a23_1', title: 'Hydra Base Cleanup', status: 'Completed', lead: 'Steve', progress: 100, domain: 'Clinical', year: '2023' },
  { id: 'a23_2', title: 'Mutation Ethics Board', status: 'Completed', lead: 'Charles', progress: 100, domain: 'Education', year: '2023' },
  { id: 'a23_3', title: 'Web Fluid Formula V3', status: 'Completed', lead: 'Peter', progress: 100, domain: 'Research', year: '2023' },
  { id: 'a23_4', title: 'Stark Expo 2023', status: 'Completed', lead: 'Tony', progress: 100, domain: 'Management', year: '2023' },
];

// 4. Roster Data (Scheduling)
export const MOCK_ROSTER = [
  // STEVE (Leader - Consistent)
  { id: 'r1', title: 'AM Clinic (Ortho)', start: '2026-02-17T08:00:00', end: '2026-02-17T12:00:00', resource: 'Steve', type: 'Clinical' },
  { id: 'r2', title: 'Admin / HOD Meeting', start: '2026-02-17T14:00:00', end: '2026-02-17T17:00:00', resource: 'Steve', type: 'Admin' },
  { id: 'r3', title: 'CPET Lab', start: '2026-02-18T08:30:00', end: '2026-02-18T12:30:00', resource: 'Steve', type: 'Clinical' },

  // PETER (Overworked Junior)
  { id: 'r4', title: 'Inpatient Rounds (Ward 45)', start: '2026-02-17T07:30:00', end: '2026-02-17T13:00:00', resource: 'Peter', type: 'Clinical' },
  { id: 'r5', title: 'Urgent Referrals', start: '2026-02-17T14:00:00', end: '2026-02-17T19:00:00', resource: 'Peter', type: 'Clinical' },
  { id: 'r6', title: 'ON CALL', start: '2026-02-17T20:00:00', end: '2026-02-18T08:00:00', resource: 'Peter', type: 'OnCall' },
  { id: 'r7', title: 'Post-Call Off', start: '2026-02-18T08:00:00', end: '2026-02-18T17:00:00', resource: 'Peter', type: 'Leave' },

  // CHARLES (Research Focus)
  { id: 'r8', title: 'Research Block (Genomics)', start: '2026-02-17T09:00:00', end: '2026-02-17T17:00:00', resource: 'Charles', type: 'Research' },
  { id: 'r9', title: 'Grant Writing', start: '2026-02-18T09:00:00', end: '2026-02-18T12:00:00', resource: 'Charles', type: 'Research' },

  // JEAN (Education)
  { id: 'r10', title: 'Student Supervision', start: '2026-02-17T08:00:00', end: '2026-02-17T12:00:00', resource: 'Jean', type: 'Education' },
  { id: 'r11', title: 'Curriculum Dev', start: '2026-02-17T13:00:00', end: '2026-02-17T16:00:00', resource: 'Jean', type: 'Admin' },

  // TONY (Tech/Off-site)
  { id: 'r12', title: 'System Upgrade', start: '2026-02-17T10:00:00', end: '2026-02-17T15:00:00', resource: 'Tony', type: 'Project' },
  { id: 'r13', title: 'WFH - Dev Sprint', start: '2026-02-18T09:00:00', end: '2026-02-18T18:00:00', resource: 'Tony', type: 'Offsite' }
];

// 5. Pulse History (Sentiment Analysis)
export const MOCK_PULSE_HISTORY = [
  { date: '2026-02-10', score: 3, sentiment: 'Tired but okay' },
  { date: '2026-02-12', score: 2, sentiment: 'Overwhelmed with admin' },
  { date: '2026-02-14', score: 4, sentiment: 'Good recovery over weekend' },
];

// 6. Pulse Trends (Weekly View)
export const MOCK_PULSE_TRENDS = [
  { day: 'Mon', Steve: 80, Peter: 60, Charles: 90, Jean: 75, Tony: 95 },
  { day: 'Tue', Steve: 75, Peter: 45, Charles: 88, Jean: 70, Tony: 92 }, // Peter crashes here
  { day: 'Wed', Steve: 78, Peter: 30, Charles: 85, Jean: 65, Tony: 90 }, // Mid-week slump
  { day: 'Thu', Steve: 82, Peter: 50, Charles: 89, Jean: 72, Tony: 93 }, // Recovery
  { day: 'Fri', Steve: 85, Peter: 55, Charles: 92, Jean: 80, Tony: 88 },
];

// 7. FIREWALL ADAPTERS (For App.jsx Simulation)

export const MOCK_STAFF_LOADS = {
  'Steve': [40, 42, 38, 45, 50, 48, 42, 40, 44, 46, 42, 40],
  'Peter': [35, 38, 40, 42, 38, 40, 45, 42, 38, 40, 42, 45],
  'Charles': [45, 48, 50, 42, 40, 38, 40, 45, 48, 50, 45, 42],
  'Jean': [20, 25, 30, 28, 35, 40, 38, 35, 30, 25, 20, 25],
  'Tony': [50, 45, 40, 38, 35, 30, 25, 30, 35, 40, 45, 50]
};

export const MOCK_TEAM_DATA = MOCK_STAFF_NAMES.map((name) => {
  const staffProjects = MOCK_PROJECTS.filter(p => p.lead === name).map(p => ({
    title: p.title,
    domain_type: p.domain.toUpperCase(),
    item_type: 'Project',
    status_dots: p.progress === 100 ? 5 : (p.progress > 50 ? 4 : 2),
    year: p.year,
    ...(p.domain === 'Clinical' && p.year === '2026' ? { monthly_hours: MOCK_STAFF_LOADS[name] } : {})
  }));

  // Guarantee a clinical load exists for the 2026 tables
  if (!staffProjects.find(p => p.title.includes('Clinical Load'))) {
      staffProjects.push({
          title: 'Clinical Load 2026',
          domain_type: 'CLINICAL',
          item_type: 'Task',
          status_dots: 4,
          year: '2026',
          monthly_hours: MOCK_STAFF_LOADS[name]
      });
  }

  return { id: name.toLowerCase(), staff_name: name, projects: staffProjects };
});
