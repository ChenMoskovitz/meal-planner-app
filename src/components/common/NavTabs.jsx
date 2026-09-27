import React from 'react';
import { NavLink } from 'react-router-dom';

/**
 * Top-level navigation.
 *
 * The app used to render all five sections stacked on one page, so reaching the
 * pantry meant scrolling past the whole meal plan. Each section is a route now.
 *
 * NavLink is used rather than Link because it reports whether its own route is
 * active, which is what draws the underline — no state here to keep in sync
 * with the URL.
 */
export const SECTIONS = [
    { path: '/plan', label: 'Plan' },
    { path: '/recipes', label: 'Recipes' },
    { path: '/pantry', label: 'Pantry' },
    { path: '/generator', label: 'Generator' },
    { path: '/goals', label: 'Goals' }
];

export default function NavTabs() {
    return (
        <nav aria-label="Sections" className="border-b border-line">
            {/* Scrollable rather than wrapping, so five tabs stay on one line
                on a phone instead of becoming two rows of different heights.
                no-scrollbar hides the track, which otherwise shows on a desktop
                where the tabs already fit. */}
            <div className="max-w-7xl mx-auto flex gap-1 overflow-x-auto no-scrollbar px-4">
                {SECTIONS.map(({ path, label }) => (
                    <NavLink
                        key={path}
                        to={path}
                        className={({ isActive }) =>
                            `shrink-0 px-4 py-3 text-xs font-bold tracking-wide border-b-2 -mb-px transition-all ${
                                isActive
                                    ? 'border-accent text-accent-dark'
                                    : 'border-transparent text-stone-500 hover:text-stone-900 hover:border-line'
                            }`
                        }
                    >
                        {label}
                    </NavLink>
                ))}
            </div>
        </nav>
    );
}
