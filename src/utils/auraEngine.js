// src/utils/auraEngine.js

// --- 1. CORE LOGIC ---

// Helper: Rotate array by k steps (Cyclic Shift)
const rotate = (arr, k) => {
    const n = arr.length;
    const offset = k % n;
    return [...arr.slice(offset), ...arr.slice(0, offset)];
};

export const generateRoster = (config) => {
    const { staff, tasks, startDate, weeks } = config;
    const start = new Date(startDate);
    let roster = {}; // Format: { "2026-01-05": [ {staff, task, type} ] }

    // --- A. MAIN CORE TASKS (Mon-Fri) ---
    // Logic: Tasks stay fixed in order, Staff rotates 1 slot every week
    for (let w = 0; w < weeks; w++) {
        // Calculate Week Start (Monday)
        const weekStart = new Date(start);
        weekStart.setDate(start.getDate() + (w * 7));

        // Get Staff Order for this week
        const currentStaffOrder = rotate(staff, w);

        // Assign Staff to Tasks
        tasks.forEach((taskName, taskIdx) => {
            const assignedStaff = currentStaffOrder[taskIdx % staff.length];

            // Fill Mon(0) to Fri(4)
            for (let d = 0; d < 5; d++) {
                const dayDate = new Date(weekStart);
                dayDate.setDate(weekStart.getDate() + d);
                const dateKey = dayDate.toISOString().split('T')[0];

                if (!roster[dateKey]) roster[dateKey] = [];
                
                roster[dateKey].push({
                    staff: assignedStaff,
                    task: taskName,
                    category: 'CORE', 
                    week: w + 1
                });
            }
        });

        // --- B. VC TASKS (Tue & Sat) ---
        // Logic: 1 person does BOTH Tue & Sat for the week. Rotates sequentially.
        const vcLead = staff[w % staff.length];

        // Tuesday (Index 1)
        const tueDate = new Date(weekStart);
        tueDate.setDate(weekStart.getDate() + 1);
        const tueKey = tueDate.toISOString().split('T')[0];
        
        if (!roster[tueKey]) roster[tueKey] = [];
        roster[tueKey].push({ staff: vcLead, task: "VC (PM)", category: "VC", week: w+1 });

        // Saturday (Index 5)
        const satDate = new Date(weekStart);
        satDate.setDate(weekStart.getDate() + 5);
        const satKey = satDate.toISOString().split('T')[0];
        
        if (!roster[satKey]) roster[satKey] = [];
        roster[satKey].push({ staff: vcLead, task: "VC (AM)", category: "VC", week: w+1 });
    }

    return roster;
};

// --- 2. EXPORT LOGIC ---

export const downloadICS = (rosterData) => {
    let ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//AURA//Roster//EN",
        "CALSCALE:GREGORIAN"
    ];

    Object.entries(rosterData).forEach(([date, shifts]) => {
        shifts.forEach(shift => {
            // Format Date: YYYYMMDD
            const dtStart = date.replace(/-/g, '');
            
            ics.push(
                "BEGIN:VEVENT",
                `DTSTART;VALUE=DATE:${dtStart}`,
                `SUMMARY:[${shift.task}] ${shift.staff}`,
                `DESCRIPTION:Week ${shift.week} - ${shift.category}`,
                "END:VEVENT"
            );
        });
    });

    ics.push("END:VCALENDAR");
    
    const blob = new Blob([ics.join("\r\n")], { type: 'text/calendar' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "AURA_Roster.ics";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const downloadCSV = (rosterData) => {
    let csv = ["Date,Week,Staff,Task,Category"];
    const sortedDates = Object.keys(rosterData).sort();
    
    sortedDates.forEach(date => {
        rosterData[date].forEach(s => {
            csv.push(`${date},${s.week},${s.staff},${s.task},${s.category}`);
        });
    });

    const blob = new Blob([csv.join("\n")], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "AURA_Roster.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
