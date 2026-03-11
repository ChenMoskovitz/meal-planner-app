import React, {useState, useEffect} from 'react';
import {supabase} from '../../config/supabaseClient.js';
import { getRecipeNutrition } from '../../utils/nutritionHelper.js';

function Recipes() {
    const [recipes, setRecipes] = useState([]);
    const [title, setTitle] = useState('');
    const [type, setType] = useState('');
    const [selectedRecipe, setSelectedRecipe] = useState(null);
    const [pantryItems, setPantryItems] = useState([]);
    const [recipeIngredients, setRecipeIngredients] = useState([]);
    const [description, setDescription] = useState('');
    const [uploadingImage, setUploadingImage] = useState(false);
    const [recipeGallery, setRecipeGallery] = useState([]);
    const RECIPE_TYPES = [
        { value: 'full_meal', label: 'Full Meal' },
        { value: 'main_dish', label: 'Main Dish' },
        { value: 'side', label: 'Side' },
        { value: 'vegetable_side', label: 'Vegetable Side' }
    ];
    const [amount, setAmount] = useState(1);
    const [selectedNutrition, setSelectedNutrition] = useState(null);
    const [baseServings, setBaseServings] = useState(1);

    useEffect(() => {
        fetchRecipes();
        fetchPantryItems();
    }, []);

    async function fetchRecipes() {
        const {data} = await supabase.from('recipes').select('*');
        if (data) setRecipes(data);
    }

    async function fetchPantryItems() {
        const {data} = await supabase.from('ingredients').select('*');
        if (data) setPantryItems(data);
    }

    async function addRecipe() {
        if (title === '') return;

        // Note: New recipes default to 1 base_serving from the DB setting
        const {error} = await supabase
            .from('recipes')
            .insert([{ name: title }]);

        if (!error) {
            setTitle('');
            fetchRecipes();
        }
    }

    async function fetchRecipeIngredients(recipeId) {
        const { data, error } = await supabase
            .from('recipe_ingredients')
            .select(`
            amount,
            ingredients:ingredient_id (
                id,
                name,
                unit_type,
                stock_quantity
            )
        `)
            .eq('recipe_id', recipeId);

        if (data) {
            const mergedData = data.map(item => ({
                ...item.ingredients,
                amount: item.amount
            }));
            setRecipeIngredients(mergedData);
        }
    }

    async function updateRecipe() {
        if (!selectedRecipe) return;

        const { error } = await supabase
            .from('recipes')
            .update({
                description: description,
                type: type,
                base_servings: baseServings
            })
            .eq('id', selectedRecipe.id);

        if (error) {
            alert("Error updating recipe: " + error.message);
        } else {
            alert("Recipe updated successfully!");
            fetchRecipes();
        }
    }

    async function deleteRecipe(recipeId) {
        if (!window.confirm("Are you sure?")) return;
        const { error } = await supabase.from('recipes').delete().eq('id', recipeId);
        if (!error) {
            setSelectedRecipe(null);
            fetchRecipes();
        }
    }

    // Helper functions for UI interactions
    const handleSelectRecipe = (recipe) => {
        setSelectedRecipe(recipe);
        setType(recipe.type || '');
        setDescription(recipe.description || '');
        setBaseServings(recipe.base_servings || 1); // SYNC STATE TO DB VALUE
        fetchRecipeIngredients(recipe.id);
        fetchRecipeGallery(recipe.id);
        setSelectedNutrition(null);
    };

    // Placeholder for other functions in your original file
    async function addIngredientToRecipe(ingredientId) { /* existing logic */ }
    async function removeIngredientFromRecipe(ingredientId) { /* existing logic */ }
    async function uploadRecipeImage(event) { /* existing logic */ }
    async function fetchRecipeGallery(recipeId) { /* existing logic */ }
    async function deleteImage(imageId, imageUrl) { /* existing logic */ }
    const calculateRecipeNutrition = async (recipeId) => {
        const totals = await getRecipeNutrition(recipeId);
        if (totals) setSelectedNutrition({ id: recipeId, ...totals });
    };

    return (
        <div className="p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">My Recipes</h2>

            {/* Top Area: Pure Creation */}
            <div className="flex gap-3 mb-8 p-4 bg-gray-50 rounded-xl border border-gray-200">
                <input
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Recipe Title (e.g. Pasta)"
                />
                <button
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg transition-colors shadow-sm"
                    onClick={addRecipe}
                >
                    Create Recipe
                </button>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* Left Side: List */}
                <div className="lg:w-1/3">
                    <h3 className="text-sm font-black uppercase tracking-wider text-gray-400 mb-4">Recipe List</h3>
                    <ul className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
                        {recipes.map(recipe => (
                            <li
                                key={recipe.id}
                                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                                    selectedRecipe?.id === recipe.id
                                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold shadow-sm'
                                        : 'bg-white border-gray-100 hover:border-gray-300 text-gray-700'
                                }`}
                                onClick={() => handleSelectRecipe(recipe)}
                            >
                                {recipe.name}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Right Side: Detail Card */}
                <div className="lg:w-2/3 min-h-[400px]">
                    {selectedRecipe ? (
                        <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-sm animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-3xl font-black text-gray-900">{selectedRecipe.name}</h2>
                                <button
                                    onClick={() => calculateRecipeNutrition(selectedRecipe.id)}
                                    className="text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-3 py-2 rounded-lg border border-indigo-100 transition-colors"
                                >
                                    📊 Show Nutrition
                                </button>
                            </div>

                            {selectedNutrition && selectedNutrition.id === selectedRecipe.id && (
                                <div className="mb-6 p-5 bg-indigo-900 text-white rounded-xl shadow-inner relative">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-indigo-300 mb-3">Nutritional Information (Per Serving)</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <p className="text-lg">🔥 <strong className="font-black">{selectedNutrition.calories.toFixed(0)}</strong> <span className="text-xs text-indigo-200">kcal</span></p>
                                        <p className="text-lg">💪 <strong className="font-black">{selectedNutrition.protein.toFixed(1)}</strong> <span className="text-xs text-indigo-200">g Protein</span></p>
                                    </div>
                                    <button
                                        className="absolute top-4 right-4 text-indigo-300 hover:text-white text-xs font-bold"
                                        onClick={() => setSelectedNutrition(null)}
                                    >
                                        ✕ Close
                                    </button>
                                </div>
                            )}

                            <div className="space-y-6">
                                {/* PORTION INPUT */}
                                <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
                                    <label className="block text-sm font-black text-orange-800 uppercase mb-2">Servings</label>
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="number"
                                            className="w-20 px-3 py-2 border border-orange-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-400"
                                            value={baseServings}
                                            min="1"
                                            onChange={(e) => setBaseServings(parseInt(e.target.value) || 1)}
                                        />
                                        <p className="text-xs font-medium text-orange-700 italic">How many portions does this full recipe make?</p>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-black text-gray-400 uppercase mb-2">Category</label>
                                    <select
                                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                                        value={type}
                                        onChange={(e) => setType(e.target.value)}
                                    >
                                        <option value="">-- Select Type --</option>
                                        {RECIPE_TYPES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-black text-gray-400 uppercase mb-2">Instructions</label>
                                    <textarea
                                        className="w-full min-h-[150px] p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-gray-700"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="Steps to cook..."
                                    />
                                </div>

                                <button
                                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl shadow-lg shadow-emerald-100 transition-all active:scale-95"
                                    onClick={updateRecipe}
                                >
                                    Save Recipe Changes
                                </button>
                            </div>

                            <div className="mt-12 flex justify-between border-t pt-6">
                                <button
                                    className="text-sm font-bold text-gray-400 hover:text-gray-600"
                                    onClick={() => setSelectedRecipe(null)}
                                >
                                    ← Back to List
                                </button>
                                <button
                                    className="text-sm font-bold text-red-400 hover:text-red-600 flex items-center gap-1"
                                    onClick={() => deleteRecipe(selectedRecipe.id)}
                                >
                                    🗑️ Delete Recipe
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-100 rounded-3xl p-12 text-center">
                            <div className="text-5xl mb-4">📖</div>
                            <p className="text-gray-400 font-medium">Select a recipe from the list to see and edit details</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Recipes;