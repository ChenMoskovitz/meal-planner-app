import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/**
 * App-wide success/error messages.
 *
 * These used to be window.alert(), which blocks the page, looks like a browser
 * error and cannot be styled. The pattern here is the one Recipes.jsx already
 * used for its inline banner, lifted into a provider so every section shares
 * one queue instead of each keeping its own copy of the state.
 *
 * The hook deliberately exposes showSuccess/showError under the same names
 * Recipes.jsx used, so its existing call sites did not have to change.
 */
const ToastContext = createContext(null);

// Long enough to read a sentence, short enough not to sit over the UI.
const DISMISS_AFTER_MS = 5000;

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    // Ids only have to be unique within a session, and a counter cannot collide
    // the way Date.now() can when two messages land in the same millisecond.
    const nextId = useRef(0);

    const dismiss = useCallback((id) => {
        setToasts(current => current.filter(toast => toast.id !== id));
    }, []);

    const show = useCallback((kind, message) => {
        const id = nextId.current++;
        setToasts(current => [...current, { id, kind, message }]);

        // No cleanup needed: dismiss() is a no-op once the toast is gone, so an
        // already-dismissed message does not care that its timer still fires.
        setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
    }, [dismiss]);

    const value = useMemo(() => ({
        showSuccess: (message) => show('success', message),
        showError: (message) => show('error', message)
    }), [show]);

    return (
        <ToastContext.Provider value={value}>
            {children}

            {/* aria-live so a screen reader announces the message without the
                focus change a dialog would force. */}
            <div
                aria-live="polite"
                className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 w-full max-w-sm pointer-events-none"
            >
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        role="status"
                        className={`pointer-events-auto flex items-start justify-between gap-3 px-4 py-3 rounded-xl text-xs font-bold shadow-lg border ${
                            toast.kind === 'success'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                : 'bg-red-50 text-red-700 border-red-100'
                        }`}
                    >
                        <span className="leading-relaxed">{toast.message}</span>
                        <button
                            aria-label="Dismiss message"
                            onClick={() => dismiss(toast.id)}
                            className="opacity-50 hover:opacity-100 shrink-0"
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);

    // A missing provider would otherwise surface as "cannot destructure
    // showSuccess of null" from whichever component called the hook.
    if (!context) throw new Error('useToast must be used inside a ToastProvider');

    return context;
}
