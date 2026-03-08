import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient.js';
import styles from './MealPlan.module.css';
import { getMultiRecipeNutrition } from '../../utils/nutritionHelper.js';

function MealPlan() {
    // --- 1. Helper Logic for Dates ---
    const getSundayOfCurrentWeek = (d) => {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day;
        return new Date(date.setDate(diff));
    };

    const getWeekDaysFromSunday = (sunday) => {
        return [...Array(7)].map((_, i) => {
            const d = new Date(sunday);
            d.setDate(d.getDate() + i);
            return d.toISOString().split('T')[0];
        });
    };

    // --- 2. States ---
    const [currentSunday, setCurrentSunday] = useState(getSundayOfCurrentWeek(new Date()));
    const [weekDates, setWeekDates] = useState(getWeekDaysFromSunday(currentSunday));
    const [plan, setPlan] = useState({});
    const [recipes, setRecipes] = useState([]);
    const [shoppingList, setShoppingList] = useState([]);
    const [dailyNutrition, setDailyNutrition] = useState({}); // Stores calorie totals
    const todayStr = new Date().toISOString().split('T')[0];
    const [showDailyNutrition, setShowDailyNutrition] = useState(false);
    const [showWeeklyStats, setShowWeeklyStats] = useState(false);

    const RECIPE_TYPES = [
        { value: 'full_meal', label: 'Full Meal' },
        { value: 'main_dish', label: 'Main Dish' },
        { value: 'side', label: 'Side' },
        { value: 'vegetable_side', label: 'Vegetable Side' }
    ];

    // --- 3. Effects ---
    useEffect(() => {
        fetchRecipes();
    }, []);

    useEffect(() => {
        if (recipes.length > 0) {
            loadSavedPlan();
        }
    }, [weekDates, recipes]);

    // This is the "Nutrition Calculator" effect we just added
    useEffect(() => {
        async function calculateAllDays() {
            const newDailyTotals = {};
            for (const date of weekDates) {
                const dayData = plan[date];
                if (dayData) {
                    const recipeIds = [
                        dayData.main?.id,
                        dayData.side?.id,
                        dayData.veg?.id
                    ];
                    const totals = await getMultiRecipeNutrition(recipeIds);
                    newDailyTotals[date] = totals;
                } else {
                    newDailyTotals[date] = { calories: 0, protein: 0, fat: 0, fiber: 0 };
                }
            }
            setDailyNutrition(newDailyTotals);
        }
        calculateAllDays();
    }, [plan, weekDates]);

    // --- 4. Logic Functions ---
    async function fetchRecipes() {
        const { data } = await supabase.from('recipes').select('*');
        if (data) setRecipes(data);
    }

    async function loadSavedPlan() {
        const { data: planData, error: loadError } = await supabase
            .from('plan_recipes')
            .select('*')
            .in('day_of_week', weekDates);

        if (loadError) return console.error(loadError);
        const loadedPlan = {};
        planData.forEach(row => {
            const day = row.day_of_week;
            const recipe = recipes.find(r => r.id === row.recipe_id);
            if (recipe) {
                if (!loadedPlan[day]) loadedPlan[day] = {};
                loadedPlan[day][row.slot_type] = recipe;
            }
        });
        setPlan(prev => ({ ...prev, ...loadedPlan }));
    }

    function setRandomForDay(day) {
        const mains = recipes.filter(r => r.type === 'main_dish' || r.type === 'full_meal');
        if (mains.length > 0) {
            const random = mains[Math.floor(Math.random() * mains.length)];
            setPlan(prev => ({ ...prev, [day]: { main: random } }));
        }
    }

    function addComponentToDay(day, typeKey, specificType) {
        const filtered = recipes.filter(r => r.type === specificType);
        if (filtered.length > 0) {
            const random = filtered[Math.floor(Math.random() * filtered.length)];
            setPlan(prev => ({
                ...prev,
                [day]: { ...prev[day], [typeKey]: random }
            }));
        }
    }

    async function saveWeeklyPlan() {
        try {
            const rowsToInsert = [];
            for (const day of weekDates) {
                const dayData = plan[day];
                if (!dayData) continue;
                if (dayData.main) rowsToInsert.push({ day_of_week: day, recipe_id: dayData.main.id, slot_type: 'main' });
                if (dayData.side) rowsToInsert.push({ day_of_week: day, recipe_id: dayData.side.id, slot_type: 'side' });
                if (dayData.veg) rowsToInsert.push({ day_of_week: day, recipe_id: dayData.veg.id, slot_type: 'veg' });
            }
            if (rowsToInsert.length === 0) return alert("Plan is empty!");
            await supabase.from('plan_recipes').delete().in('day_of_week', weekDates);
            await supabase.from('plan_recipes').insert(rowsToInsert);
            alert("Weekly Plan Saved! 🚀");
        } catch (error) {
            alert("Failed to save: " + error.message);
        }
    }

    async function generateShoppingList() {
        const recipeIds = [];
        Object.values(plan).forEach(day => {
            if (day?.main) recipeIds.push(day.main.id);
            if (day?.side) recipeIds.push(day.side.id);
            if (day?.veg) recipeIds.push(day.veg.id);
        });
        if (recipeIds.length === 0) return alert("Plan a meal first!");
        const { data, error } = await supabase.from('recipe_ingredients').select(`amount, ingredients:ingredient_id (name, unit, stock_quantity)`).in('recipe_id', recipeIds);
        if (error) return console.error(error);
        const totals = data.reduce((acc, item) => {
            if (!item.ingredients) return acc;
            const name = item.ingredients.name;
            if (!acc[name]) acc[name] = { amount: 0, unit: item.ingredients.unit || '', stock: item.ingredients.stock_quantity || 0 };
            acc[name].amount += (item.amount || 0);
            return acc;
        }, {});
        setShoppingList(Object.entries(totals).filter(([_, info]) => info.amount > info.stock).map(([name, info]) => ({ name, display: `${info.amount - info.stock} ${info.unit} ${name}` })));
    }

    const changeWeek = (days) => {
        const newSunday = new Date(currentSunday);
        newSunday.setDate(newSunday.getDate() + days);
        setCurrentSunday(newSunday);
        setWeekDates(getWeekDaysFromSunday(newSunday));
    };

    // Calculate the grand totals for all 7 days in the current week view
    const weeklyTotals = Object.values(dailyNutrition).reduce((acc, day) => {
        return {
            calories: acc.calories + (day.calories || 0),
            protein: acc.protein + (day.protein || 0),
            fat: acc.fat + (day.fat || 0),
            fiber: acc.fiber + (day.fiber || 0),
        };
    }, { calories: 0, protein: 0, fat: 0, fiber: 0 });

// Calculate the average (Total / 7 days)
    const dailyAverage = {
        calories: weeklyTotals.calories / 7,
        protein: weeklyTotals.protein / 7,
        fat: weeklyTotals.fat / 7,
        fiber: weeklyTotals.fiber / 7,
    };
    // --- 5. Render ---
    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2>📅 Weekly Dinner Plan</h2>
                <div className={styles.navControls}>
                    <button className={styles.navButton} onClick={() => changeWeek(-7)}>⬅️ Previous Week</button>
                    <button className={styles.navButton} onClick={() => setCurrentSunday(getSundayOfCurrentWeek(new Date()))}>Today</button>
                    <button className={styles.navButton} onClick={() => changeWeek(7)}>Next Week ➡️</button>
                </div>
                <button className={styles.saveButton} onClick={saveWeeklyPlan}>💾 Save Weekly Plan</button>
                <button
                    className={styles.navButton}
                    onClick={() => setShowDailyNutrition(!showDailyNutrition)}
                >
                    {showDailyNutrition ? '📊 Hide Daily kcal' : '📊 Show Daily kcal'}
                </button>
                <button
                    className={styles.navButton}
                    onClick={() => setShowWeeklyStats(!showWeeklyStats)}
                >
                    {showWeeklyStats ? '📈 Hide Weekly Stats' : '📈 Show Weekly Stats'}
                </button>
            </div>

            <div className={styles.calendarGrid}>
                {weekDates.map(dateStr => {
                    const isToday = dateStr === todayStr;
                    const dayNutri = dailyNutrition[dateStr];

                    return (
                        <div key={dateStr} className={`${styles.dayBox} ${isToday ? styles.todayBox : ''}`}>
                            {isToday && <span className={styles.todayBadge}>TODAY</span>}

                            <strong className={styles.dateLabel}>
                                {new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
                                    weekday: 'short', month: 'short', day: 'numeric'
                                })}
                            </strong>

                            {/* Only shows if the user clicked the toggle button above */}
                            {/* Only shows if the user clicked the toggle button */}
                            {showDailyNutrition && dayNutri && dayNutri.calories > 0 && (
                                <div className={styles.dayNutritionCard}>
                                    <div className={styles.miniMacro}>🔥 {dayNutri.calories.toFixed(0)} <small>kcal</small></div>
                                    <div className={styles.miniMacro}>💪 {dayNutri.protein.toFixed(1)}g <small>P</small></div>
                                    <div className={styles.miniMacro}>🥑 {dayNutri.fat.toFixed(1)}g <small>F</small></div>
                                    <div className={styles.miniMacro}>🍞 {dayNutri.fiber.toFixed(1)}g <small>Fb</small></div>
                                </div>
                            )}

                            {plan[dateStr] ? (
                                <div className={styles.mealCard}>
                                    <strong>{plan[dateStr].main?.name}</strong>
                                    {plan[dateStr].side && <div className={styles.sideText}>🥗 {plan[dateStr].side.name}</div>}
                                    {plan[dateStr].veg && <div className={styles.sideText}>🥦 {plan[dateStr].veg.name}</div>}

                                    {plan[dateStr].main?.type === 'main_dish' && (
                                        <div className={styles.actionArea}>
                                            <button className={styles.smallButton} onClick={() => addComponentToDay(dateStr, 'side', 'side')}>+ Side</button>
                                            <button className={styles.smallButton} onClick={() => addComponentToDay(dateStr, 'veg', 'vegetable_side')}>+ Veggie</button>
                                        </div>
                                    )}
                                    <button className={styles.removeButton} onClick={() => setPlan(prev => ({ ...prev, [dateStr]: null }))}>Remove</button>
                                </div>
                            ) : (
                                <div>
                                    <select className={styles.selectInput} onChange={(e) => {
                                        const selected = recipes.find(r => r.id === e.target.value);
                                        setPlan(prev => ({ ...prev, [dateStr]: { main: selected } }));
                                    }}>
                                        <option value="">Choose...</option>
                                        {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </select>
                                    <button className={styles.randomButton} onClick={() => setRandomForDay(dateStr)}>🎲 Random</button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            {showWeeklyStats && (
                <div className={styles.weeklySummaryCard}>
                    <h3>Weekly Summary (Average per Day)</h3>
                    <div className={styles.statsGrid}>
                        <div className={styles.statBox}>
                            <strong>Average Calories</strong>
                            <p>🔥 {dailyAverage.calories.toFixed(0)} kcal</p>
                        </div>
                        <div className={styles.statBox}>
                            <strong>Average Protein</strong>
                            <p>💪 {dailyAverage.protein.toFixed(1)}g</p>
                        </div>
                        <div className={styles.statBox}>
                            <strong>Average Fat</strong>
                            <p>🥑 {dailyAverage.fat.toFixed(1)}g</p>
                        </div>
                        <div className={styles.statBox}>
                            <strong>Average Fiber</strong>
                            <p>🍞 {dailyAverage.fiber.toFixed(1)}g</p>
                        </div>
                    </div>
                    <div className={styles.totalBadge}>
                        Total Week Calories: {weeklyTotals.calories.toFixed(0)} kcal
                    </div>
                </div>
            )}
            <div style={{ textAlign: 'center', marginTop: '40px' }}>
                <button className={styles.generateButton} onClick={generateShoppingList}>🛒 Generate Shopping List</button>

                {shoppingList.length > 0 && (
                    <div className={styles.shoppingListCard}>
                        <h3>Your Shopping List</h3>
                        <ul className={styles.shoppingList}>
                            {shoppingList.map((item, index) => (
                                <li key={index} className={styles.shoppingItem}>
                                    {item.display}
                                </li>
                            ))}
                        </ul>
                        <button
                            className={styles.removeButton}
                            onClick={() => setShoppingList([])}
                        >
                            Clear List
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default MealPlan;