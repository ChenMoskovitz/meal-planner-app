import React, { useState, useEffect } from 'react';

const IngredientSearch = ({ onSelect }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    // This effect handles the "Debounce" logic
    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            if (query.length > 2) {
                searchFood();
            } else {
                setResults([]);
            }
        }, 500); // Waits 500ms after you stop typing to call the API

        return () => clearTimeout(delayDebounceFn);
    }, [query]);

    const searchFood = async () => {
        setLoading(true);
        // These match the names we put in your .env file
        const appId = import.meta.env.VITE_EDAMAM_FOOD_ID;
        const appKey = import.meta.env.VITE_EDAMAM_FOOD_KEY;

        try {
            const response = await fetch(
                `https://api.edamam.com/api/food-database/v2/parser?app_id=${appId}&app_key=${appKey}&ingr=${query}`
            );
            const data = await response.json();
            // 'hints' is the array of food items Edamam sends back
            setResults(data.hints || []);
        } catch (error) {
            console.error("Error fetching food from Edamam:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative w-full mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
                Search Ingredient
            </label>
            <div className="relative">
                <input
                    type="text"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all pr-10"
                    placeholder="e.g. Chicken, Broccoli, Pasta..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />

                {loading && (
                    <div className="absolute right-3 top-3.5">
                        <div className="animate-spin h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full"></div>
                    </div>
                )}
            </div>

            {/* The Results Dropdown */}
            {results.length > 0 && (
                <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {results.map((hint, index) => (
                        <li
                            key={index}
                            className="p-3 hover:bg-indigo-50 cursor-pointer border-b last:border-b-0 flex justify-between items-center transition-colors"
                            onClick={() => {
                                onSelect(hint.food); // Sends the whole food object to the parent
                                setQuery(hint.food.label); // Fills the input with the name
                                setResults([]); // Closes the dropdown
                            }}
                        >
                            <div>
                                <span className="font-semibold text-gray-800">{hint.food.label}</span>
                                <p className="text-xs text-gray-500 capitalize">{hint.food.category}</p>
                            </div>
                            <div className="text-right">
                 <span className="text-xs font-medium text-indigo-600">
                    {Math.round(hint.food.nutrients.ENERC_KCAL)} kcal/100g
                 </span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default IngredientSearch;