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
    const [permanentList, setPermanentList] = useState([]);

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
// 1. Get all ingredients for the planned meals (Step 2 of your strategy)
    async function getWeeklyIngredients() {
        const recipeIds = [];
        Object.values(plan).forEach(day => {
            if (day?.main) recipeIds.push(day.main.id);
            if (day?.side) recipeIds.push(day.side.id);
            if (day?.veg) recipeIds.push(day.veg.id);
        });

        if (recipeIds.length === 0) return alert("Add some meals to your plan first!");

        const { data, error } = await supabase
            .from('recipe_ingredients')
            .select(`amount, ingredients:ingredient_id (name, unit)`)
            .in('recipe_id', recipeIds);

        if (error) return console.error(error);

        // Group ingredients so "Onion" doesn't appear 5 times
        const totals = data.reduce((acc, item) => {
            if (!item.ingredients) return acc;
            const name = item.ingredients.name;
            if (!acc[name]) acc[name] = { amount: 0, unit: item.ingredients.unit || '' };
            acc[name].amount += (item.amount || 0);
            return acc;
        }, {});

        setShoppingList(Object.entries(totals).map(([name, info]) => ({
            name,
            display: `${info.amount} ${info.unit} ${name}`
        })));
    }

// 2. Add a specific item to the PERMANENT shopping list (Step 3 of your strategy)
    async function addToPermanentList(itemName, amount) {
        const { error } = await supabase
            .from('shopping_list')
            .insert([{ item_name: itemName, amount: amount, is_bought: false }]);

        if (error) {
            alert("Error adding item: " + error.message);
        } else {
            // Optional: show a small success toast or change the button icon
            console.log(`${itemName} added to list!`);
        }
    }
    // async function generateShoppingList() {
    //     const recipeIds = [];
    //     Object.values(plan).forEach(day => {
    //         if (day?.main) recipeIds.push(day.main.id);
    //         if (day?.side) recipeIds.push(day.side.id);
    //         if (day?.veg) recipeIds.push(day.veg.id);
    //     });
    //     const { data, error } = await supabase.from('recipe_ingredients').select(`amount, ingredients:ingredient_id (name, unit, stock_quantity)`).in('recipe_id', recipeIds);
    //     if (error) return;
    //     const totals = data.reduce((acc, item) => {
    //         if (!item.ingredients) return acc;
    //         const name = item.ingredients.name;
    //         if (!acc[name]) acc[name] = { amount: 0, unit: item.ingredients.unit || '', stock: item.ingredients.stock_quantity || 0 };
    //         acc[name].amount += (item.amount || 0);
    //         return acc;
    //     }, {});
    //     setShoppingList(Object.entries(totals).filter(([_, info]) => info.amount > info.stock).map(([name, info]) => ({ name, display: `${info.amount - info.stock} ${info.unit} ${name}` })));
    // }

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
    useEffect(() => {
        if (recipes.length > 0) {
            loadSavedPlan();
            fetchPermanentList(); // Refresh the shopping list when the week changes
        }
    }, [weekDates, recipes]);

    async function fetchPermanentList() {
        // We only want items created between the Sunday and Saturday of the current view
        const firstDay = weekDates[0];
        const lastDay = weekDates[6];

        const { data } = await supabase
            .from('shopping_list')
            .select('*')
            .gte('created_at', firstDay) // Greater than or equal to Sunday
            .lte('created_at', `${lastDay}T23:59:59`) // Less than or equal to Saturday night
            .order('created_at', { ascending: false });

        if (data) setPermanentList(data);
    }


    async function addToPermanentList(itemName, amount) {
        // Force the item to be "born" on the Monday of the week you are viewing
        // This ensures it stays attached to this specific week view
        const targetDate = weekDates[1]; // Using Monday of the selected week

        const { error } = await supabase
            .from('shopping_list')
            .insert([{
                item_name: itemName,
                amount: amount,
                is_bought: false,
                created_at: new Date(targetDate).toISOString()
            }]);

        if (!error) fetchPermanentList();
    }

    async function toggleBought(id, currentStatus) {
        await supabase.from('shopping_list').update({ is_bought: !currentStatus }).eq('id', id);
        fetchPermanentList();
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

                            {showDailyNutrition && dayNutri && dayNutri.calories > 0 && (
                                <div className="mb-3 p-2 bg-gray-50 rounded-lg border border-gray-100 text-center animate-in fade-in duration-200">
                                    <div className="text-[9px] uppercase font-bold text-gray-400">Per Serving</div>
                                    <div className="text-xs font-bold text-gray-700 flex items-center justify-center gap-1">🔥 {dayNutri.calories.toFixed(0)} kcal</div>
                                </div>
                            )}

                            {dayPlan && dayPlan.main ? (
                                <div className="space-y-3">
                                    <div className="p-3 bg-white rounded-xl border border-gray-100 shadow-sm">
                                        <div className="text-sm font-bold text-gray-800 leading-tight mb-1">{dayPlan.main?.name}</div>

                                        {/* LEFTOVERS LOGIC */}
                                        {(() => {
                                            const base = dayPlan.main.base_servings || 1;
                                            const leftovers = base - globalPlannedServings;
                                            return leftovers > 0 ? (
                                                <span className="inline-block bg-purple-100 text-purple-700 text-[10px] font-black px-2 py-0.5 rounded-md mt-1">
                                        +{leftovers} Leftovers
                                    </span>
                                            ) : null;
                                        })()}

                                        {/* DISPLAY SIDE/VEG IF THEY EXIST */}
                                        {dayPlan.side && <div className="text-[11px] text-gray-600 mt-2 truncate">🥗 {dayPlan.side.name}</div>}
                                        {dayPlan.veg && <div className="text-[11px] text-gray-600 mt-0.5 truncate">🥦 {dayPlan.veg.name}</div>}

                                        {/* BUTTONS TO ADD SIDE/VEG IF THEY ARE MISSING */}
                                        <div className="mt-3 pt-2 border-t border-gray-50 space-y-1">
                                            {/* Only show these buttons if the main dish is NOT a full_meal */}
                                            {dayPlan.main?.type !== 'full_meal' && (
                                                <>
                                                    {!dayPlan.side && (
                                                        <button
                                                            className="w-full text-[9px] font-bold py-1 bg-gray-50 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 rounded transition-colors"
                                                            onClick={() => addComponentToDay(dateStr, 'side', 'side_dish')}
                                                        >
                                                            + Add Side
                                                        </button>
                                                    )}
                                                    {!dayPlan.veg && (
                                                        <button
                                                            className="w-full text-[9px] font-bold py-1 bg-gray-50 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 rounded transition-colors"
                                                            onClick={() => addComponentToDay(dateStr, 'veg', 'vegetable')}
                                                        >
                                                            + Add Veg
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <button className="w-full text-[10px] font-bold text-red-400 hover:text-red-600 transition-colors" onClick={() => setPlan(prev => ({ ...prev, [dateStr]: null }))}>Remove All</button>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <select className="w-full text-[10px] p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none" onChange={(e) => {
                                        const selected = recipes.find(r => r.id === e.target.value);
                                        setPlan(prev => ({ ...prev, [dateStr]: { main: selected } }));
                                    }}>
                                        <option value="">Choose Main...</option>
                                        {recipes.filter(r => r.type === 'main_dish' || r.type === 'full_meal').map(r => (
                                            <option key={r.id} value={r.id}>{r.name}</option>
                                        ))}
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

            {/* THE SHOPPING COMMAND CENTER */}
            <div className="mt-12 border-t border-gray-200 pt-12">
                {/* Header Row */}
                <div className="mb-8 text-center md:text-left">
                    <h3 className="text-2xl font-black text-gray-900 tracking-tight">🛒 Shopping Manager</h3>
                    <p className="text-gray-500 font-medium">Review your week and build your final grocery list</p>
                </div>

                <div className="flex flex-col md:flex-row gap-8 items-start">

                    {/* LEFT COLUMN: Ingredient Review */}
                    <div className="flex-1 w-full">
                        <button
                            className="w-full bg-white border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 px-6 py-4 rounded-2xl font-black transition-all active:scale-95 mb-6 shadow-sm"
                            onClick={getWeeklyIngredients}
                        >
                            🔍 1. Generate Review from Plan
                        </button>

                        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                            {shoppingList.length === 0 && (
                                <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400 font-medium italic">
                                    Click the button above to see what you need...
                                </div>
                            )}
                            {shoppingList.map((item, index) => (
                                <div key={index} className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-sm group hover:border-indigo-100 transition-all">
                                    <span className="font-bold text-gray-700 capitalize leading-tight">{item.display}</span>
                                    <button
                                        onClick={() => addToPermanentList(item.name, item.display)}
                                        className="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white px-4 py-2 rounded-xl text-[10px] font-black transition-all active:scale-90 shadow-sm uppercase tracking-wider"
                                    >
                                        + Add
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Final List (Matches Height & Light Theme) */}
                    <div className="w-full md:w-96 bg-white rounded-3xl p-6 border border-gray-200 shadow-xl self-start sticky top-8">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-gray-900 font-black text-lg tracking-tight">📝 2. Final List</h3>
                            <span className="bg-gray-100 text-gray-500 text-[10px] font-black px-2 py-1 rounded-lg uppercase">
                    {permanentList.length} items
                </span>
                        </div>

                        <div className="space-y-3">
                            {permanentList.length === 0 ? (
                                <p className="text-gray-400 text-xs italic font-medium py-12 text-center border-2 border-dashed border-gray-100 rounded-2xl">
                                    Your list is empty. Add items from the left!
                                </p>
                            ) : (
                                permanentList.map((item) => (
                                    <div
                                        key={item.id}
                                        onClick={() => toggleBought(item.id, item.is_bought)}
                                        className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer group 
                                ${item.is_bought ? 'bg-gray-50 border-transparent' : 'bg-white border-gray-50 hover:border-indigo-100 shadow-sm'}`}
                                    >
                                        {/* Visual Checkbox */}
                                        <div className={`mt-0.5 w-5 h-5 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition-all 
                                ${item.is_bought ? 'bg-indigo-500 border-indigo-500 shadow-inner' : 'border-gray-300 group-hover:border-indigo-400'}`}>
                                            {item.is_bought && (
                                                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>

                                        {/* Text Content with Strikethrough */}
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm font-bold leading-tight truncate transition-all 
                                    ${item.is_bought ? 'text-gray-300 line-through decoration-indigo-300/50 decoration-2' : 'text-gray-700'}`}>
                                                {item.item_name}
                                            </p>
                                            <p className={`text-[9px] font-black uppercase tracking-tight 
                                    ${item.is_bought ? 'text-gray-200' : 'text-gray-400'}`}>
                                                {item.amount}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {permanentList.length > 0 && (
                            <button
                                onClick={async () => {
                                    if(window.confirm("Delete all items?")) {
                                        await supabase.from('shopping_list').delete().neq('id', '00000000-0000-0000-0000-000000000000');
                                        fetchPermanentList();
                                    }
                                }}
                                className="w-full mt-8 py-3 text-[10px] font-black text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl uppercase tracking-widest transition-all border border-transparent hover:border-red-100"
                            >
                                Clear All Items
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default MealPlan;