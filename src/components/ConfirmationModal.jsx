import React from 'react';

const ConfirmationModal = ({ isOpen, title, message, onCancel, onConfirm }) => {
    // Return null if the modal is not open
    if (!isOpen) return null;

    return (
        // OVERLAY (Darkens the background)
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm animate-in fade-in duration-200">
            
            {/* MODAL BOX (Styling mimicking your dark theme) */}
            <div className="relative w-[340px] max-w-[90%] bg-slate-950 dark:bg-slate-900 p-6 rounded-2xl shadow-2xl border border-slate-700/50 animate-in zoom-in-95 duration-200">
                
                {/* HEADER (The part you want customized!) */}
                <h3 className="text-sm font-black text-slate-100 dark:text-slate-200 uppercase tracking-widest opacity-80 mb-3 text-center">
                    {title}
                </h3>
                
                {/* MESSAGE (e.g., "Sign out?") */}
                <p className="text-xl font-medium text-slate-300 dark:text-slate-300 text-center mb-6">
                    {message}
                </p>

                {/* FOOTER (Actions) */}
                <div className="grid grid-cols-2 gap-3 mt-4">
                    {/* CANCEL ACTION (Left, dark button) */}
                    <button 
                        onClick={onCancel}
                        className="w-full px-5 py-3 rounded-xl text-sm font-black uppercase text-slate-300 bg-slate-800 hover:bg-slate-700/50 transition-colors active:scale-95 shadow-sm"
                    >
                        Cancel
                    </button>
                    
                    {/* CONFIRM ACTION (Right, lighter button as on screenshot) */}
                    <button 
                        onClick={onConfirm}
                        className="w-full px-5 py-3 rounded-xl text-sm font-black uppercase text-slate-900 bg-slate-300 hover:bg-white transition-colors active:scale-95 shadow-lg"
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;
