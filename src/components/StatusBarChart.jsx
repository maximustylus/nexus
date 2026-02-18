import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const STATUS_CONFIG = {
    1: { label: 'Stuck', color: '#E2445C' },
    2: { label: 'Planning', color: '#A25DDC' },
    3: { label: 'Working', color: '#FDAB3D' },
    4: { label: 'Review', color: '#0073EA' },
    5: { label: 'Done', color: '#00C875' }
};

const StatusBarChart = ({ data }) => {
    // 1. Initialize counts for Tasks vs Projects
    const counts = {
        1: { task: 0, project: 0 },
        2: { task: 0, project: 0 },
        3: { task: 0, project: 0 },
        4: { task: 0, project: 0 },
        5: { task: 0, project: 0 }
    };
    
    // 2. Aggregate Data
    data.forEach(staff => {
        if (staff.projects) {
            staff.projects.forEach(p => {
                const status = p.status_dots || 1;
                const type = p.item_type === 'Project' ? 'project' : 'task';
                
                if (counts[status]) {
                    counts[status][type]++;
                }
            });
        }
    });

    // 3. Format for Recharts (Stacked)
    const chartData = [
        { name: 'Stuck', Task: counts[1].task, Project: counts[1].project },
        { name: 'Planning', Task: counts[2].task, Project: counts[2].project },
        { name: 'Working', Task: counts[3].task, Project: counts[3].project },
        { name: 'Review', Task: counts[4].task, Project: counts[4].project },
        { name: 'Done', Task: counts[5].task, Project: counts[5].project },
    ];

    return (
        <div className="w-full h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    layout="vertical"
                    data={chartData}
                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                >
                    <XAxis type="number" hide />
                    <YAxis 
                        dataKey="name" 
                        type="category" 
                        tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} 
                        width={60}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip 
                        cursor={{ fill: 'transparent' }}
                        contentStyle={{ borderRadius: '6px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                        itemStyle={{ fontSize: '12px', padding: 0 }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}/>
                    
                    {/* Stacked Bars: Tasks (Blue), Projects (Purple) */}
                    <Bar dataKey="Task" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} barSize={24} />
                    <Bar dataKey="Project" stackId="a" fill="#a855f7" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default StatusBarChart;
