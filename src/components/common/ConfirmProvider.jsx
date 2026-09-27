import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

/**
 * In-app replacement for window.confirm().
 *
 * confirm() returns a promise that resolves true or false, so a call site reads
 * almost exactly as it did before:
 *
 *     if (!await confirm({ ... })) return;
 *
 * The promise's resolve function is held in a ref until the user picks, which is
 * what lets one dialog serve every caller without each of them keeping its own
 * open/closed state.
 */
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
    const [request, setRequest] = useState(null);
    const resolveRef = useRef(null);

    const confirm = useCallback(({ title, message, confirmLabel = 'Confirm', destructive = false }) => {
        setRequest({ title, message, confirmLabel, destructive });

        return new Promise(resolve => {
            resolveRef.current = resolve;
        });
    }, []);

    const settle = (answer) => {
        // Closing without answering has to resolve too, or an awaited call would
        // hang forever and the action would silently never run.
        resolveRef.current?.(answer);
        resolveRef.current = null;
        setRequest(null);
    };

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}

            {request && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4"
                    // Clicking the backdrop cancels, matching how the Escape key
                    // behaves in a native dialog.
                    onClick={() => settle(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="confirm-title"
                        // Without this, a click inside the card reaches the
                        // backdrop handler above and cancels the dialog.
                        onClick={event => event.stopPropagation()}
                        className="bg-white rounded-3xl shadow-xl border border-gray-100 p-6 w-full max-w-sm"
                    >
                        <h2 id="confirm-title" className="text-lg font-black text-gray-900 tracking-tight">
                            {request.title}
                        </h2>

                        {request.message && (
                            <p className="mt-2 text-sm text-gray-500 font-medium leading-relaxed">
                                {request.message}
                            </p>
                        )}

                        <div className="mt-6 flex gap-3">
                            <button
                                onClick={() => settle(false)}
                                className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-500 border border-gray-200 hover:bg-gray-50 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                autoFocus
                                onClick={() => settle(true)}
                                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-white transition-all active:scale-95 ${
                                    request.destructive
                                        ? 'bg-red-600 hover:bg-red-700'
                                        : 'bg-indigo-600 hover:bg-indigo-700'
                                }`}
                            >
                                {request.confirmLabel}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
}

export function useConfirm() {
    const context = useContext(ConfirmContext);

    if (!context) throw new Error('useConfirm must be used inside a ConfirmProvider');

    return context;
}
