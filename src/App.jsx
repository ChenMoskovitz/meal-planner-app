import React, { useEffect } from 'react';
import Pantry from './components/Pantry/Pantry.jsx';
import Recipes from './components/Recipes/Recipes.jsx';
import Meals from './components/Meals/Meals.jsx';
import MealPlan from "./components/MealPlan/MealPlan.jsx";


// Only one import for the API tool
import fetchNutrition from './utils/apiTest.js';

function App() {
    useEffect(() => {
        // This will now work!
        fetchNutrition('apple');
    }, []);

    return (
        /* This replaces <div className={styles.mainApp}> */
        <div className="min-h-screen bg-gray-50 p-8 space-y-12">
            <h1 className="text-4xl font-black text-center text-gray-900 mb-8">
                Meal Planner
            </h1>

            {/* These replace your <hr className={styles.divider} /> */}
            <section className="max-w-7xl mx-auto"><MealPlan /></section>
            <section className="max-w-7xl mx-auto"><Pantry /></section>
            <section className="max-w-7xl mx-auto"><Recipes /></section>
            <section className="max-w-7xl mx-auto"><Meals /></section>

        </div>
    );
}

export default App;