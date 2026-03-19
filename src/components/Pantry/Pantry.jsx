import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient.js';
import fetchNutrition from '../../utils/apiTest.js';
import { formatIngredientNutrition } from '../../utils/nutritionHelper.js';

function Pantry() {
    const [name, setName] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [ingredients, setIngredients] = useState([]);
    const [unitType, setUnitType] = useState('g');
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        fetchIngredients();
    }, []);

    async function fetchIngredients() {
        const { data } = await supabase.from('ingredients').select('*');
        if (data) setIngredients(data);
    }

    async function addIngredient() {
        if (name === '') return;
        const existingItem = ingredients.find(i => i.name.toLowerCase() === name.toLowerCase());
        const finalQuantity = existingItem ? Number(existingItem.stock_quantity) + Number(quantity) : Number(quantity);

        const { error } = await supabase.from('ingredients').upsert({
            name,
            stock_quantity: finalQuantity,
            unit_type: unitType
        }, { onConflict: 'name' });

        if (!error) {
            setName('');
            setQuantity(1);
            fetchIngredients();
        }
    }

    async function deleteIngredient(id) {
        await supabase.from('ingredients').delete().eq('id', id);
        fetchIngredients();
    }

    const handleFetchNutrition = async (item) => {
        const foodData = await fetchNutrition(item.name);
        if (foodData && foodData.nutrients) {
            const nutrients = formatIngredientNutrition(foodData.nutrients);
            const { error } = await supabase
                .from('ingredients')
                .update({
                    calories_per_unit: nutrients.calories,
                    unit_type: unitType,
                    protein_per_unit: nutrients.protein,
                    fat_per_unit: nutrients.fat,
                    fiber_per_unit: nutrients.fiber
                })
                .eq('id', item.id);

            if (!error) {
                alert(`Updated! 1${unitType} of ${item.name} is ${nutrients.calories.toFixed(4)} kcal.`);
                fetchIngredients();
            }
        }
    };

    return (
        <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100">
            {/* 2. UPDATE HEADER: Added flexbox and the toggle button */}
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">My Pantry</h2>
                <button
                    onClick={() => setIsVisible(!isVisible)}
                    className="text-xs font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1 rounded-lg transition-colors"
                >
                    {isVisible ? 'Hide Section ↑' : 'Show Section ↓' }
                </button>
            </div>

            <div className="flex flex-wrap gap-3 mb-8">
                <input
                    className="flex-2 min-w-[200px] px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ingredient Name"
                />
                <input
                    className="w-24 px-4 py-2 border border-gray-300 rounded-lg outline-none"
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                />

                <select
                    className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 outline-none"
                    value={unitType}
                    onChange={(e) => setUnitType(e.target.value)}
                >
                    <option value="g">Grams (g)</option>
                    <option value="ml">Milliliters (ml)</option>
                </select>

                <button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-6 rounded-lg transition-colors duration-200"
                    onClick={addIngredient}
                >
                    Add Item
                </button>
            </div>

            {isVisible && (
                <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    {ingredients.map(item => (
                        <li key={item.id} className="flex justify-between items-center p-4 bg-gray-50 border border-gray-200 rounded-xl hover:shadow-md transition-shadow duration-200">
                            <div className="flex flex-col">
                                <span className="font-bold text-gray-800">{item.name}</span>
                                <span className="inline-block mt-1 text-xs font-bold text-indigo-700 bg-indigo-100 px-2 py-1 rounded-full w-fit">
                                    Stock: {item.stock_quantity}{item.unit_type}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleFetchNutrition(item)}
                                    className="text-sm bg-white border border-gray-300 hover:bg-gray-100 px-3 py-1 rounded-md transition-colors"
                                >
                                    🔍 Info
                                </button>
                                <button
                                    className="text-gray-400 hover:text-red-600 text-xl px-2 transition-colors"
                                    onClick={() => deleteIngredient(item.id)}
                                >
                                    ✕
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default Pantry;