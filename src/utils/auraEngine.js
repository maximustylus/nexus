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
    let roster = {}; 

    // --- A. MAIN CORE TASKS (Mon-Fri) ---
    for (let w = 0; w < weeks; w++) {
        const weekStart = new Date(start);
        weekStart.setDate(start.getDate() + (w * 7));

        const currentStaffOrder = rotate(staff, w);

        tasks.forEach((taskName, taskIdx) => {
            const leadStaff = currentStaffOrder[taskIdx % staff.length];
            const coLeadStaff = currentStaffOrder[(taskIdx + 1) % staff.length];

            for (let d = 0; d < 5; d++) {
                const dayDate = new Date(weekStart);
                dayDate.setDate(weekStart.getDate() + d);
                const dateKey = dayDate.toISOString().split('T')[0];

                if (!roster[dateKey]) roster[dateKey] = [];
                
                // Unified shift object per task
                roster[dateKey].push({
                    task: taskName,
                    lead: leadStaff,
                    coLead: coLeadStaff,
                    staff: `Lead: ${leadStaff}, Co: ${coLeadStaff}`, // Formats the UI and ICS perfectly
                    category: 'CORE', 
                    week: w + 1
                });
            }
        });

        // --- B. VC TASKS (Tue & Sat) ---
        const vcLead = staff[w % staff.length];
        const vcCoLead = staff[(w + 1) % staff.length];

        // Tuesday (Index 1)
        const tueDate = new Date(weekStart);
        tueDate.setDate(weekStart.getDate() + 1);
        const tueKey = tueDate.toISOString().split('T')[0];
        
        if (!roster[tueKey]) roster[tueKey] = [];
        roster[tueKey].push({ 
            task: "VC (PM)", 
            lead: vcLead,
            coLead: vcCoLead,
            staff: `Lead: ${vcLead}, Co: ${vcCoLead}`,
            category: "VC", 
            week: w + 1 
        });

        // Saturday (Index 5)
        const satDate = new Date(weekStart);
        satDate.setDate(weekStart.getDate() + 5);
        const satKey = satDate.toISOString().split('T')[0];
        
        if (!roster[satKey]) roster[satKey] = [];
        roster[satKey].push({ 
            task: "VC (AM)", 
            lead: vcLead,
            coLead: vcCoLead,
            staff: `Lead: ${vcLead}, Co: ${vcCoLead}`,
            category: "VC", 
            week: w + 1 
        });
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
            const dtStart = date.replace(/-/g, '');
            
            ics.push(
                "BEGIN:VEVENT",
                `DTSTART;VALUE=DATE:${dtStart}`,
                `SUMMARY:[${shift.task}] ${shift.staff}`, // This will output exactly: [EFT] Lead: BF, Co: DK
                `DESCRIPTION:Week ${shift.week} - ${shift.category}`,
                "END:VEVENT"
            );
        });
    });

    ics.push("END:VCALENDAR");
    
    const blob = new Blob([ics.join("\r\n")], { type: 'text/calendar' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "AURA_Roster_Merged.ics";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export const downloadCSV = (rosterData) => {
    // Dedicated Lead and Co-Lead columns for cleaner Excel filtering
    let csv = ["Date,Week,Task,Category,Lead,Co-Lead"];
    const sortedDates = Object.keys(rosterData).sort();
    
    sortedDates.forEach(date => {
        rosterData[date].forEach(s => {
            csv.push(`${date},${s.week},${s.task},${s.category},${s.lead},${s.coLead}`);
        });
    });

    const blob = new Blob([csv.join("\n")], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = "AURA_Roster_Merged.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
