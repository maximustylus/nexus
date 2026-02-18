import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const STATUS_CONFIG = {
    1: { label: 'Stuck', color: '#E2445C' },
    2: { label: 'Planning', color: '#A25DDC' },
    3: { label: 'Working', color: '#FDAB3D' },
    4: { label: 'Review', color: '#0073EA' },
    5: { label: 'Done', color: '#00C875' }
};

const TaskProjectBarChart = ({ data }) => {
    // 1. Initialize counts
    // Structure: { Tasks: {1:0, 2:0...}, Projects: {1:0, 2:0...} }
    const counts = {
        Task: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        Project: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    };

    // 2. Aggregate Data
    data.forEach(staff => {
        if (staff.projects) {
            staff.projects.forEach(p => {
                const status = p.status_dots || 1;
                // Default to 'Task' if undefined, normalize case
                const type = (p.item_type === 'Project') ? 'Project' : 'Task';
                if (counts[type] && counts[type][status] !== undefined) {
                    counts[type][status]++;
                }
            });
        }
    });

    // 3. Format for Recharts
    // We need two rows: one for Task, one for Project
    const chartData = [
        {
            name: 'Tasks',
            ...counts.Task // Spreads {1: x, 2: y...}
        },
        {
            name: 'Projects',
            ...counts.Project
        }
    ];

    return (
        <div className="w-full h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    layout="vertical"
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
                >
                    <XAxis type="number" hide />
                    <YAxis 
                        dataKey="name" 
                        type="category" 
                        tick={{ fontSize: 12, fontWeight: 'bold', fill: '#64748b' }} 
                        width={60}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip 
                        cursor={{ fill: 'transparent' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                    
                    {/* Stacked Bars using Status Colors */}
                    <Bar dataKey="1" name="Stuck" stackId="a" fill={STATUS_CONFIG[1].color} barSize={30} />
                    <Bar dataKey="2" name="Planning" stackId="a" fill={STATUS_CONFIG[2].color} barSize={30} />
                    <Bar dataKey="3" name="Working" stackId="a" fill={STATUS_CONFIG[3].color} barSize={30} />
                    <Bar dataKey="4" name="Review" stackId="a" fill={STATUS_CONFIG[4].color} barSize={30} />
                    <Bar dataKey="5" name="Done" stackId="a" fill={STATUS_CONFIG[5].color} radius={[0, 4, 4, 0]} barSize={30} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

export default TaskProjectBarChart;
