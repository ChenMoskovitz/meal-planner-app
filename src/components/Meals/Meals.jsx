import React, { useState } from 'react';
import { supabase } from '../../config/supabaseClient.js';
import { getRecipeNutrition } from '../../utils/nutritionHelper.js';

function Meals() {
    const [suggestion, setSuggestion] = useState(null);
    const [sideSuggestion, setSideSuggestion] = useState(null);
    const [vegSideSuggestion, setVegSideSuggestion] = useState(null);
    const [loading, setLoading] = useState(false);
    const [comboNutrition, setComboNutrition] = useState({
        calories: 0, protein: 0, fat: 0, fiber: 0
    });
    const [showNutrition, setShowNutrition] = useState(false);

    async function updateComboTotal(mainId, sideId = null, vegId = null) {
        // Fetch nutrition for all selected parts
        const main = await getRecipeNutrition(mainId);
        const side = sideId ? await getRecipeNutrition(sideId) : { calories: 0, protein: 0, fat: 0, fiber: 0 };
        const veg = vegId ? await getRecipeNutrition(vegId) : { calories: 0, protein: 0, fat: 0, fiber: 0 };

        if (main) {
            setComboNutrition({
                calories: main.calories + (side?.calories || 0) + (veg?.calories || 0),
                protein: main.protein + (side?.protein || 0) + (veg?.protein || 0),
                fat: main.fat + (side?.fat || 0) + (veg?.fat || 0),
                fiber: main.fiber + (side?.fiber || 0) + (veg?.fiber || 0),
            });
        }
    }

    async function fetchRandomByType(type, setter) {
        const { data, error } = await supabase
            .from('recipes')
            .select('*')
            .eq('type', type);

        if (data && data.length > 0) {
            const selectedPart = data[Math.floor(Math.random() * data.length)];
            setter(selectedPart);

            // THE ADD STEP:
            // We pass the Main ID, the Side ID (if type is side), and the Veg ID (if type is veg)
            if (type === 'side') {
                // Keep current Veggie if it exists, use new Side
                await updateComboTotal(suggestion.id, selectedPart.id, vegSideSuggestion?.id);
            } else if (type === 'vegetable_side') {
                // Keep current Side if it exists, use new Veggie
                await updateComboTotal(suggestion.id, sideSuggestion?.id, selectedPart.id);
            }
        } else {
            alert(`No recipes found for type: ${type}`);
        }
    }

    // Change the name here to match what the button uses, or vice versa
    async function pickRandomMeal() {
        setLoading(true);
        setSideSuggestion(null);
        setVegSideSuggestion(null);

        const { data, error } = await supabase
            .from('recipes')
            .select('*')
            .or('type.eq.full_meal,type.eq.main_dish');

        if (data && data.length > 0) {
            // 1. Capture the random recipe in a variable 'selected'
            const randomIndex = Math.floor(Math.random() * data.length);
            const selected = data[randomIndex];

            // 2. Set the UI suggestion
            setSuggestion(selected);

            // 3. THE RESET: Calculate nutrition for ONLY this new recipe
            // We send 'null' for side and veg because they were just cleared above
            await updateComboTotal(selected.id, null, null);

        } else {
            alert("No Full Meals or Main Dishes found!");
        }

        setLoading(false);
    }

    return (
        <div className="p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                🍽️ Meal Generator
            </h2>

            <button
                onClick={pickRandomMeal}
                disabled={loading}
                className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold py-3 px-8 rounded-xl transition-all shadow-lg shadow-indigo-100 active:scale-95"
            >
                {loading ? 'Searching...' : '🎲 Generate Random Meal'}
            </button>

            {suggestion && (
                <div className="mt-8 p-6 bg-gray-50 rounded-2xl border border-gray-200 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h3 className="text-xl font-black text-gray-800 mb-4">{suggestion.name}</h3>

                    <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-gray-200 aspect-video flex items-center justify-center">
                        {suggestion.image_url ? (
                            <img
                                src={suggestion.image_url}
                                alt={suggestion.name}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="text-gray-500 font-medium italic">
                                No image added yet
                            </div>
                        )}
                    </div>

                    {suggestion.type === 'main_dish' && (
                        <div className="flex flex-wrap gap-3 mb-6">
                            <button
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold py-2 px-4 rounded-lg text-sm transition-colors"
                                onClick={() => fetchRandomByType('side', setSideSuggestion)}
                            >
                                🥗 Add a Side
                            </button>
                            <button
                                className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold py-2 px-4 rounded-lg text-sm transition-colors"
                                onClick={() => fetchRandomByType('vegetable_side', setVegSideSuggestion)}
                            >
                                🥦 Add a Veggie Side
                            </button>
                        </div>
                    )}

                    {/* Selected Sides Rows */}
                    <div className="space-y-3 mb-6">
                        {sideSuggestion && (
                            <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 shadow-sm">
                                {sideSuggestion.image_url && (
                                    <img src={sideSuggestion.image_url} className="w-12 h-12 rounded-md object-cover" alt="side" />
                                )}
                                <p className="text-sm text-gray-700"><strong>Side:</strong> {sideSuggestion.name}</p>
                            </div>
                        )}

                        {vegSideSuggestion && (
                            <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 shadow-sm">
                                {vegSideSuggestion.image_url && (
                                    <img src={vegSideSuggestion.image_url} className="w-12 h-12 rounded-md object-cover" alt="veg side" />
                                )}
                                <p className="text-sm text-gray-700"><strong>Veggie:</strong> {vegSideSuggestion.name}</p>
                            </div>
                        )}
                    </div>

                    {/* Nutrition Toggle */}
                    <button
                        className="text-sm font-bold text-indigo-600 hover:text-indigo-800 underline underline-offset-4"
                        onClick={() => setShowNutrition(!showNutrition)}
                    >
                        {showNutrition ? '📊 Hide Nutrition' : '📊 Show Meal Nutrition'}
                    </button>

                    {/* The Nutrition Card */}
                    {showNutrition && (
                        <div className="mt-4 p-5 bg-indigo-900 text-white rounded-xl shadow-inner animate-in zoom-in-95 duration-200">
                            <h4 className="text-xs font-black uppercase tracking-widest text-indigo-300 mb-3">Meal Combo Totals</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-indigo-200 uppercase font-bold">Calories</span>
                                    <span className="text-lg font-black">🔥 {comboNutrition.calories.toFixed(0)}</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-indigo-200 uppercase font-bold">Protein</span>
                                    <span className="text-lg font-black">💪 {comboNutrition.protein.toFixed(1)}g</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-indigo-200 uppercase font-bold">Fat</span>
                                    <span className="text-lg font-black">🥑 {comboNutrition.fat.toFixed(1)}g</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-indigo-200 uppercase font-bold">Fiber</span>
                                    <span className="text-lg font-black">🍞 {comboNutrition.fiber.toFixed(1)}g</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default Meals;