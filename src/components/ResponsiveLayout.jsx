import { LayoutDashboard, Archive, Calendar, Activity, BookOpen } from 'lucide-react';
import React from 'react';

const ResponsiveLayout = ({ children, activeTab, onNavigate, floatingWidgets }) => {
  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'archive', icon: Archive, label: 'Archive' },
    { id: 'roster', icon: Calendar, label: 'Roster' },
    { id: 'pulse', icon: Activity, label: 'Pulse' },
    { id: 'guide', icon: BookOpen, label: 'Guide' }
  ];

  return (
    // 1. 🛡️ THE APP SHELL: Locked exactly to the mobile screen
    <div className="h-[100dvh] w-full overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 transition-colors duration-500 relative">
      
      {/* 2. 🛡️ THE SCROLLABLE CONTENT: Only the dashboard scrolls inside this area */}
      <div className="flex-1 overflow-y-auto w-full relative">
        <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 
                        pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] 
                        pb-32 xl:pb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {children}
          </div>
        </div>
      </div>

      {/* 3. 🛡️ THE NAV BAR: Positioned at the bottom */}
      <div className="xl:hidden absolute bottom-0 left-0 w-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 z-[100] 
                      pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <div className="flex justify-around items-center h-16 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
                  isActive 
                    ? 'text-indigo-600 dark:text-indigo-400' 
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                <div className={`p-1.5 rounded-xl transition-all duration-300 ${
                  isActive ? 'bg-indigo-50 dark:bg-indigo-500/20 translate-y-[-2px]' : ''
                }`}>
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className="text-[10px] font-bold tracking-wide">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. 🛡️ THE WIDGETS (FIXED): The invisible shield is gone! */}
      {/* [&>*]:pointer-events-auto targets ONLY the widgets, allowing clicks to pass through the empty space */}
      <div className="absolute inset-0 pointer-events-none z-[110] [&>*]:pointer-events-auto">
          {floatingWidgets}
      </div>

    </div>
  );
};

export default ResponsiveLayout;
