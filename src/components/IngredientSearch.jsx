import React, { useState, useEffect, useRef } from 'react';

const IngredientSearch = ({ onSelect, hideLabel = false }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchedQuery, setSearchedQuery] = useState('');
    const [selectedLabel, setSelectedLabel] = useState('');
    const containerRef = useRef(null);

    // Clicking anywhere outside the box closes the dropdown.
    useEffect(() => {
        function handleClickOutside(e) {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setResults([]);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // This effect handles the "Debounce" logic
    useEffect(() => {
        if (query.length <= 2) {
            setResults([]);
            setError(null);
            return;
        }

        // Picking an item fills the input with its name. Don't treat that as a
        // new search, or the dropdown reopens on the thing just chosen.
        if (query === selectedLabel) {
            setResults([]);
            return;
        }

        // Aborting the previous request stops a slow earlier response from
        // landing after a newer one and overwriting its results.
        const controller = new AbortController();
        const delayDebounceFn = setTimeout(() => {
            searchFood(controller.signal);
        }, 500); // Waits 500ms after you stop typing to call the API

        return () => {
            clearTimeout(delayDebounceFn);
            controller.abort();
        };
    }, [query, selectedLabel]);

    const searchFood = async (signal) => {
        setLoading(true);
        setError(null);
        // These match the names we put in your .env file
        const appId = import.meta.env.VITE_EDAMAM_FOOD_ID;
        const appKey = import.meta.env.VITE_EDAMAM_FOOD_KEY;

        try {
            const response = await fetch(
                `https://api.edamam.com/api/food-database/v2/parser?app_id=${appId}&app_key=${appKey}&ingr=${encodeURIComponent(query)}`,
                { signal }
            );

            // A rejected key or an exhausted quota still arrives as a valid
            // response, so check the status before trusting the body.
            if (!response.ok) throw new Error(`Edamam responded ${response.status}`);

            const data = await response.json();
            // 'hints' is the array of food items Edamam sends back
            setResults(data.hints || []);
            setSearchedQuery(query);
        } catch (err) {
            if (err.name === 'AbortError') return; // superseded by a newer search
            console.error("Error fetching food from Edamam:", err);
            setResults([]);
            setError("Couldn't reach the food database. Try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative w-full" ref={containerRef}>
            {!hideLabel && (
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Search Ingredient
                </label>
            )}
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

            {error && (
                <p className="mt-1 text-xs font-medium text-red-600">{error}</p>
            )}

            {!loading && !error && searchedQuery === query && results.length === 0 && (
                <p className="mt-1 text-xs text-gray-500">No results for &ldquo;{query}&rdquo;.</p>
            )}

            {/* The Results Dropdown */}
            {results.length > 0 && (
                <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                    {results.map((hint) => (
                        <li
                            key={hint.food.foodId}
                            className="p-3 hover:bg-indigo-50 cursor-pointer border-b last:border-b-0 flex justify-between items-center transition-colors"
                            onClick={() => {
                                onSelect(hint.food); // Sends the whole food object to the parent
                                setQuery(hint.food.label); // Fills the input with the name
                                setSelectedLabel(hint.food.label);
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