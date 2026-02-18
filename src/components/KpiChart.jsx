import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const KpiChart = ({ data, staffNames }) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Calculate Team Target (30 per staff member)
    const staffCount = staffNames.length || 1;
    const teamTarget = staffCount * 30;

    const chartData = months.map(month => {
        let total = 0;
        data.forEach(staff => {
            const monthData = staff.clinical_load?.find(m => m.month === month);
            if (monthData) {
                total += parseInt(monthData.count || 0);
            }
        });
        return {
            name: month,
            Total: total,
            Target: teamTarget
        };
    });

    return (
        <div style={{ width: '100%', height: 350 }}>
            <ResponsiveContainer>
                <LineChart
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 0, bottom: 10 }}
                >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    
                    <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#64748b', fontSize: 12 }} 
                        dy={10}
                    />
                    
                    <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#64748b', fontSize: 12 }} 
                    />
                    
                    <Tooltip 
                        contentStyle={{ 
                            backgroundColor: '#fff', 
                            border: 'none', 
                            borderRadius: '6px',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                            fontSize: '12px'
                        }}
                    />
                    
                    {/* NO LEGEND (Clean Look) */}
                    
                    {/* Target Line (Red Dashed) */}
                    <Line 
                        type="monotone" 
                        dataKey="Target" 
                        stroke="#ef4444" 
                        strokeDasharray="5 5" 
                        strokeWidth={2} 
                        dot={false} 
                    />
                    
                    {/* Actual Data Line (Blue) */}
                    <Line 
                        type="monotone" 
                        dataKey="Total" 
                        stroke="#3b82f6" 
                        strokeWidth={3} 
                        activeDot={{ r: 6 }} 
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export default KpiChart;
