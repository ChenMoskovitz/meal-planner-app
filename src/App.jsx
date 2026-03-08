import React, { useEffect } from 'react';
import Pantry from './components/Pantry/Pantry.jsx';
import Recipes from './components/Recipes/Recipes.jsx';
import Meals from './components/Meals/Meals.jsx';
import MealPlan from "./components/MealPlan/MealPlan.jsx";
import styles from './App.module.css';

// Only one import for the API tool
import fetchNutrition from './utils/apiTest.js';

function App() {
    useEffect(() => {
        // This will now work!
        fetchNutrition('apple');
    }, []);

    return (
        <div className={styles.mainApp}>
            <h1 className={styles.title}>Meal Planner Pro</h1>
            <hr className={styles.divider} />
            <Pantry />
            <hr className={styles.divider} />
            <Recipes />
            <hr className={styles.divider} />
            <Meals />
            <hr className={styles.divider} />
            <MealPlan />
        </div>
    );
}

export default App;