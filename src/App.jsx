import React, { useState, useEffect } from 'react';
import { supabase } from './config/supabaseClient';
import Auth from './components/Auth/Auth';
import Pantry from './components/Pantry/Pantry.jsx';
import Recipes from './components/Recipes/Recipes.jsx';
import Meals from './components/Meals/Meals.jsx';
import MealPlan from "./components/MealPlan/MealPlan.jsx";
import UserGoals from "./components/Goals/UserGoals.jsx";

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
        <div className="min-h-screen bg-gray-50 p-8 space-y-12 relative">
            {/* Logout Button */}
            <button
                onClick={() => supabase.auth.signOut()}
                className="absolute top-8 right-8 bg-white border border-gray-200 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 hover:text-red-600 transition-all shadow-sm"
            >
                Logout
            </button>

            <div className="text-center mb-8">
                <h1 className="text-4xl font-black text-gray-900">
                    Meal Planner
                </h1>
                <p className="text-gray-400 text-xs font-bold uppercase mt-2">
                    Logged in as: {session.user.email}
                </p>
            </div>

            <section className="max-w-7xl mx-auto"><UserGoals /></section>
            <section className="max-w-7xl mx-auto"><MealPlan /></section>
            <section className="max-w-7xl mx-auto"><Pantry /></section>
            <section className="max-w-7xl mx-auto"><Recipes /></section>
            <section className="max-w-7xl mx-auto"><Meals /></section>
        </div>
    );
}

export default App;