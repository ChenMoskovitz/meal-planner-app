import React, { useState, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { supabase } from './config/supabaseClient';
import Auth from './components/Auth/Auth';
import Pantry from './components/Pantry/Pantry.jsx';
import Recipes from './components/Recipes/Recipes.jsx';
import Meals from './components/Meals/Meals.jsx';
import MealPlan from "./components/MealPlan/MealPlan.jsx";
import UserGoals from "./components/Goals/UserGoals.jsx";
import NavTabs from './components/common/NavTabs.jsx';

function App() {
    const [session, setSession] = useState(null);

    useEffect(() => {
        // 1. Check for an existing session on load
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
        });

        // 2. Listen for login/logout changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    // 3. THE GATEKEEPER: If no user is logged in, show ONLY the Auth screen
    if (!session) {
        return <Auth />;
    }

    // 4. THE MAIN APP: Only visible if logged in
    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-lg font-black text-gray-900 tracking-tight">
                            Meal Planner
                        </h1>
                        <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">
                            {session.user.email}
                        </p>
                    </div>

                    <button
                        onClick={() => supabase.auth.signOut()}
                        className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 hover:text-red-600 transition-all shadow-sm"
                    >
                        Logout
                    </button>
                </div>

                <NavTabs />
            </header>

            <main className="max-w-7xl mx-auto px-4 py-8">
                <Routes>
                    {/* The weekly plan is the app's home screen. The Playwright
                        sign-in fixtures land on "/" and wait for its heading, so
                        changing this default means updating them too. */}
                    <Route path="/" element={<Navigate to="/plan" replace />} />
                    <Route path="/plan" element={<MealPlan />} />
                    <Route path="/recipes" element={<Recipes />} />
                    <Route path="/pantry" element={<Pantry />} />
                    <Route path="/generator" element={<Meals />} />
                    <Route path="/goals" element={<UserGoals />} />

                    {/* A stale bookmark or a typo lands on the plan rather than
                        on a blank page. */}
                    <Route path="*" element={<Navigate to="/plan" replace />} />
                </Routes>
            </main>
        </div>
    );
}

export default App;
