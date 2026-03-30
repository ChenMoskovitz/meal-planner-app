import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient.js';
import { getMultiRecipeNutrition } from '../../utils/nutritionHelper.js';

function MealPlan() {
    // --- 1. Helper Logic for Dates (Logic Unchanged) ---
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

    // --- 2. States (Logic Unchanged) ---
    const [currentSunday, setCurrentSunday] = useState(getSundayOfCurrentWeek(new Date()));
    const [weekDates, setWeekDates] = useState(getWeekDaysFromSunday(currentSunday));
    const [plan, setPlan] = useState({});
    const [recipes, setRecipes] = useState([]);
    const [shoppingList, setShoppingList] = useState([]);
    const [dailyNutrition, setDailyNutrition] = useState({});
    const todayStr = new Date().toISOString().split('T')[0];
    const [showDailyNutrition, setShowDailyNutrition] = useState(false);
    const [showWeeklyStats, setShowWeeklyStats] = useState(false);
    const [globalPlannedServings, setGlobalPlannedServings] = useState(2);
    const [nutritionalGoals, setNutritionalGoals] = useState(null);

    // --- 3. Effects (Logic Unchanged) ---
    useEffect(() => {
        fetchRecipes();
        fetchUserGoals();
    }, []);

    useEffect(() => {
        if (recipes.length > 0) {
            loadSavedPlan();
        }
    }, [weekDates, recipes]);

    useEffect(() => {
        async function calculateAllDays() {
            const newDailyTotals = {};
            for (const date of weekDates) {
                const dayData = plan[date];
                if (dayData) {
                    const recipeIds = [dayData.main?.id, dayData.side?.id, dayData.veg?.id];
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

    // --- 4. Logic Functions (Logic Unchanged) ---
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
            await supabase.from('plan_recipes').delete().in('day_of_week', weekDates);
            await supabase.from('plan_recipes').insert(rowsToInsert);
            alert("Weekly Plan Saved! 🚀");
        } catch (error) { alert("Failed to save: " + error.message); }
    }

    async function generateShoppingList() {
        const recipeIds = [];
        Object.values(plan).forEach(day => {
            if (day?.main) recipeIds.push(day.main.id);
            if (day?.side) recipeIds.push(day.side.id);
            if (day?.veg) recipeIds.push(day.veg.id);
        });
        const { data, error } = await supabase.from('recipe_ingredients').select(`amount, ingredients:ingredient_id (name, unit, stock_quantity)`).in('recipe_id', recipeIds);
        if (error) return;
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

    const weeklyTotals = Object.values(dailyNutrition).reduce((acc, day) => ({
        calories: acc.calories + (day.calories || 0),
        protein: acc.protein + (day.protein || 0),
        fat: acc.fat + (day.fat || 0),
        fiber: acc.fiber + (day.fiber || 0),
    }), { calories: 0, protein: 0, fat: 0, fiber: 0 });

    const dailyAverage = {
        calories: weeklyTotals.calories / 7,
        protein: weeklyTotals.protein / 7,
        fat: weeklyTotals.fat / 7,
        fiber: weeklyTotals.fiber / 7,
    };

    async function fetchUserGoals() {
        const { data, error } = await supabase
            .from('user_goals')
            .select('*')
            .eq('user_label', 'default')
            .single();

        if (data) {
            setNutritionalGoals(data);
        } else if (error) {
            console.error("Error fetching goals:", error);
        }
    }

    // --- 5. Render ---
    return (
        <div className="max-w-7xl mx-auto p-4 md:px-8 pb-8 bg-gray-50">
            {/* Header Section */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <h2 className="text-2xl font-extrabold text-gray-900">📅 Weekly Dinner Plan</h2>
                    <div className="flex items-center gap-2">
                        <button className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors" onClick={() => changeWeek(-7)}>⬅️ Prev</button>
                        <button className="px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-bold" onClick={() => setCurrentSunday(getSundayOfCurrentWeek(new Date()))}>Today</button>
                        <button className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors" onClick={() => changeWeek(7)}>Next ➡️</button>
                    </div>
                </div>

                <div className="flex flex-wrap gap-3 mt-6">
                    <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl font-bold shadow-md transition-all active:scale-95" onClick={saveWeeklyPlan}>💾 Save Plan</button>

                    {/* FIXED TOGGLES */}
                    <button
                        className={`border px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${showDailyNutrition ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                        onClick={() => setShowDailyNutrition(!showDailyNutrition)}
                    >
                        {showDailyNutrition ? '📊 Hide kcal' : '📊 Show kcal'}
                    </button>
                    <button
                        className={`border px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${showWeeklyStats ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                        onClick={() => setShowWeeklyStats(!showWeeklyStats)}
                    >
                        {showWeeklyStats ? '📈 Hide Stats' : '📈 Show Stats'}
                    </button>

                    <div className="ml-auto flex items-center gap-2 bg-orange-50 px-4 py-2 rounded-xl border border-orange-100">
                        <label className="text-sm font-bold text-orange-800 uppercase tracking-tight">Planning for:</label>
                        <input
                            type="number"
                            min="1"
                            value={globalPlannedServings}
                            onChange={(e) => setGlobalPlannedServings(parseInt(e.target.value) || 1)}
                            className="w-10 bg-transparent border-b-2 border-orange-300 text-center font-bold text-orange-900 outline-none"
                        />
                        <span className="text-sm font-bold text-orange-800">people</span>
                    </div>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {weekDates.map(dateStr => {
                    const isToday = dateStr === todayStr;
                    const dayNutri = dailyNutrition[dateStr];
                    const dayPlan = plan[dateStr];

                    return (
                        <div key={dateStr} className={`relative p-3 rounded-xl border-2 transition-all ${isToday ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-100' : 'bg-white border-gray-100 hover:border-gray-200'}`}>
                            {isToday && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg uppercase tracking-widest">Today</span>}

                            <div className="text-center mb-3">
                                <div className="text-[10px] font-bold text-gray-400 uppercase">{new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}</div>
                                <div className="text-lg font-black text-gray-900">{new Date(dateStr + 'T00:00:00').getDate()}</div>
                            </div>

                            {/* RESTORED KCAL DISPLAY */}
                            {showDailyNutrition && dayNutri && dayNutri.calories > 0 && (
                                <div className="mb-3 p-2 bg-gray-50 rounded-lg border border-gray-100 text-center animate-in fade-in duration-200">
                                    <div className="text-[9px] uppercase font-bold text-gray-400">Per Serving</div>
                                    <div className="text-xs font-bold text-gray-700 flex items-center justify-center gap-1">🔥 {dayNutri.calories.toFixed(0)} kcal</div>
                                </div>
                            )}

                            {dayPlan ? (
                                <div className="space-y-3">
                                    <div className="p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                                        <div className="text-sm font-bold text-gray-800 leading-tight mb-1">{dayPlan.main?.name}</div>

                                        {/* RESTORED LEFTOVERS LOGIC */}
                                        {dayPlan.main && (
                                            (() => {
                                                const base = dayPlan.main.base_servings || 1;
                                                const leftovers = base - globalPlannedServings;
                                                return leftovers > 0 ? (
                                                    <span className="inline-block bg-purple-100 text-purple-700 text-[10px] font-black px-2 py-0.5 rounded-md mt-1 animate-in zoom-in-50">
                                                    +{leftovers} Leftovers
                                                </span>
                                                ) : null;
                                            })()
                                        )}

                                        {dayPlan.side && <div className="text-[11px] text-gray-600 mt-2 truncate">🥗 {dayPlan.side.name}</div>}
                                        {dayPlan.veg && <div className="text-[11px] text-gray-600 mt-0.5 truncate">🥦 {dayPlan.veg.name}</div>}
                                    </div>
                                    <button className="w-full text-[10px] font-bold text-red-400 hover:text-red-600 transition-colors" onClick={() => setPlan(prev => ({ ...prev, [dateStr]: null }))}>Remove</button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <select className="w-full text-[10px] p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none" onChange={(e) => {
                                        const selected = recipes.find(r => r.id === e.target.value);
                                        setPlan(prev => ({ ...prev, [dateStr]: { main: selected } }));
                                    }}>
                                        <option value="">Choose...</option>
                                        {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                    </select>
                                    <button className="w-full text-[10px] font-bold py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg" onClick={() => setRandomForDay(dateStr)}>🎲 Random</button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* RESTORED WEEKLY STATS */}
            {showWeeklyStats && nutritionalGoals && (
                <div className="mt-8 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm animate-in slide-in-from-bottom-4 duration-300">
                    <h3 className="text-lg font-black text-gray-900 mb-4 tracking-tighter">Weekly Summary (Per Person)</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

                        {/* 1. Calories - Max Limit Logic */}
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Avg Calories</span>
                                <span className="text-[10px] font-black text-black bg-gray-200 px-1.5 py-0.5 rounded">Goal: {nutritionalGoals.target_calories}</span>
                            </div>
                            <div className={`text-xl font-black ${dailyAverage.calories > nutritionalGoals.target_calories ? 'text-red-500' : 'text-emerald-600'}`}>
                                {dailyAverage.calories > nutritionalGoals.target_calories ? '⚠️' : '✅'} {dailyAverage.calories.toFixed(0)}
                            </div>

                            {/* Progress Bar for Calories */}
                            <div className="w-full h-2 bg-gray-200 rounded-full mt-2 overflow-hidden shadow-inner">
                                <div
                                    className={`h-full transition-all duration-700 ease-out ${dailyAverage.calories > nutritionalGoals.target_calories ? 'bg-red-500' : 'bg-emerald-500'}`}
                                    style={{ width: `${Math.min((dailyAverage.calories / nutritionalGoals.target_calories) * 100, 100)}%` }}
                                ></div>
                            </div>

                            <p className="text-[9px] mt-2 font-medium text-gray-500 italic">
                                {dailyAverage.calories > nutritionalGoals.target_calories
                                    ? `Over daily limit by ${(dailyAverage.calories - nutritionalGoals.target_calories).toFixed(0)} kcal`
                                    : "Under daily calorie limit"}
                            </p>
                        </div>

                        {/* 2. Protein - Minimum Target Logic */}
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Avg Protein</span>
                                <span className="text-[10px] font-black text-black bg-gray-200 px-1.5 py-0.5 rounded">Goal: {nutritionalGoals.min_protein}g</span>
                            </div>
                            <div className={`text-xl font-black ${dailyAverage.protein >= nutritionalGoals.min_protein ? 'text-emerald-600' : 'text-orange-500'}`}>
                                {dailyAverage.protein >= nutritionalGoals.min_protein ? '✅' : '💪'} {dailyAverage.protein.toFixed(1)}g
                            </div>

                            {/* Progress Bar for Protein */}
                            <div className="w-full h-2 bg-gray-200 rounded-full mt-2 overflow-hidden shadow-inner">
                                <div
                                    className={`h-full transition-all duration-700 ease-out ${dailyAverage.protein >= nutritionalGoals.min_protein ? 'bg-emerald-500' : 'bg-orange-500'}`}
                                    style={{ width: `${Math.min((dailyAverage.protein / nutritionalGoals.min_protein) * 100, 100)}%` }}
                                ></div>
                            </div>

                            <p className="text-[9px] mt-2 font-medium text-gray-500 italic">
                                {dailyAverage.protein >= nutritionalGoals.min_protein
                                    ? "Protein goal reached!"
                                    : `Need ${(nutritionalGoals.min_protein - dailyAverage.protein).toFixed(1)}g more daily`}
                            </p>
                        </div>

                        {/* 3. Fiber - Minimum Target Logic */}
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Avg Fiber</span>
                                <span className="text-[10px] font-black text-black bg-gray-200 px-1.5 py-0.5 rounded">Goal: {nutritionalGoals.min_fiber}g</span>
                            </div>
                            <div className={`text-xl font-black ${dailyAverage.fiber >= nutritionalGoals.min_fiber ? 'text-emerald-600' : 'text-orange-500'}`}>
                                {dailyAverage.fiber >= nutritionalGoals.min_fiber ? '✅' : '🍞'} {dailyAverage.fiber.toFixed(1)}g
                            </div>

                            {/* Progress Bar for Fiber */}
                            <div className="w-full h-2 bg-gray-200 rounded-full mt-2 overflow-hidden shadow-inner">
                                <div
                                    className={`h-full transition-all duration-700 ease-out ${dailyAverage.fiber >= nutritionalGoals.min_fiber ? 'bg-emerald-500' : 'bg-orange-500'}`}
                                    style={{ width: `${Math.min((dailyAverage.fiber / nutritionalGoals.min_fiber) * 100, 100)}%` }}
                                ></div>
                            </div>

                            <p className="text-[9px] mt-2 font-medium text-gray-500 italic">
                                {dailyAverage.fiber >= nutritionalGoals.min_fiber
                                    ? "Fiber goal reached!"
                                    : `Need ${(nutritionalGoals.min_fiber - dailyAverage.fiber).toFixed(1)}g more daily`}
                            </p>
                        </div>

                    </div>
                </div>
            )}

            {/* SHOPPING LIST - Compact and No-Gap */}
            <div className="mt-8 flex flex-col items-center">
                <button
                    className="bg-gray-900 hover:bg-black text-white px-8 py-4 rounded-2xl font-black shadow-xl transition-all hover:-translate-y-1 active:scale-95 flex items-center gap-3"
                    onClick={generateShoppingList}
                >
                    🛒 Generate Shopping List
                </button>

                {shoppingList.length > 0 && (
                    <div className="mt-6 w-full max-w-md bg-white p-6 rounded-3xl shadow-2xl border border-gray-100 text-left animate-in fade-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h3 className="text-lg font-black text-gray-900">Your Shopping List</h3>
                            <button onClick={() => setShoppingList([])} className="text-xs font-bold text-gray-400 hover:text-red-500 uppercase">Clear ×</button>
                        </div>
                        <ul className="space-y-3">
                            {shoppingList.map((item, index) => (
                                <li key={index} className="flex items-center gap-3 text-gray-700 font-medium italic">
                                    <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                                    {item.display}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}

export default MealPlan;