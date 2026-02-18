import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// Specific colors for each CEP
const STAFF_COLORS = {
    'Alif': '#3b82f6',      // Blue
    'Fadzlynn': '#10b981',  // Emerald
    'Derlinder': '#f59e0b', // Amber
    'Ying Xian': '#ef4444', // Red
    'Brandon': '#6366f1'    // Indigo
};

const StaffLoadChart = ({ data }) => {
    // 1. Filter out Nisa (Admin) and keep only CEPs
    const cepStaff = data.filter(staff => staff.staff_name !== 'Nisa');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cepStaff.map((staff) => {
                // Prepare data for this specific person
                const chartData = months.map(month => {
                    const record = (staff.clinical_load || []).find(m => m.month === month);
                    return {
                        name: month,
                        count: record ? parseInt(record.count) : 0
                    };
                });

                return (
                    <div key={staff.id} className="border border-slate-100 dark:border-slate-700 rounded p-4 bg-white dark:bg-slate-800 shadow-sm">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                            {staff.staff_name}
                        </h3>
                        <div className="h-[150px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                                    <XAxis 
                                        dataKey="name" 
                                        tick={{ fontSize: 10, fill: '#94a3b8' }} 
                                        axisLine={false} 
                                        tickLine={false} 
                                        interval={1} // Show alternate months to save space if needed
                                    />
                                    <YAxis 
                                        tick={{ fontSize: 10, fill: '#94a3b8' }} 
                                        axisLine={false} 
                                        tickLine={false} 
                                    />
                                    <Tooltip 
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ borderRadius: '4px', border: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', fontSize: '11px' }}
                                    />
                                    <Bar 
                                        dataKey="count" 
                                        fill={STAFF_COLORS[staff.staff_name] || '#cbd5e1'} 
                                        radius={[2, 2, 0, 0]} 
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default StaffLoadChart;
