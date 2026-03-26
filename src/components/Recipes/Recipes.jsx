import React, {useState, useEffect} from 'react';
import {supabase} from '../../config/supabaseClient.js';
import { getRecipeNutrition } from '../../utils/nutritionHelper.js';
import IngredientSearch from '../IngredientSearch';

function Recipes() {
    const [recipes, setRecipes] = useState([]);
    const [title, setTitle] = useState('');
    const [type, setType] = useState('');
    const [selectedRecipe, setSelectedRecipe] = useState(null);
    const [pantryItems, setPantryItems] = useState([]);
    const [recipeIngredients, setRecipeIngredients] = useState([]);
    const [description, setDescription] = useState('');
    const [uploadingImage, setUploadingImage] = useState(false);
    const [amount, setAmount] = useState(1);
    const [selectedNutrition, setSelectedNutrition] = useState(null);
    const [baseServings, setBaseServings] = useState(1);
    const [isVisible, setIsVisible] = useState(true);

    const RECIPE_TYPES = [
        { value: 'full_meal', label: 'Full Meal' },
        { value: 'main_dish', label: 'Main Dish' },
        { value: 'side', label: 'Side' },
        { value: 'vegetable_side', label: 'Vegetable Side' }
    ];

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

    // --- NEW LOGIC: HANDLING API INGREDIENTS ---
    async function handleApiIngredientSelect(food) {
        if (!selectedRecipe) return;

        // 1. Check if this ingredient already exists in your DB by name
        let { data: existingIng, error: searchError } = await supabase
            .from('ingredients')
            .select('id')
            .eq('name', food.label)
            .single();

        let ingredientId;

        if (existingIng) {
            ingredientId = existingIng.id;
        } else {
            // 2. If it doesn't exist, create it using the API data!
            const { data: newIng, error: createError } = await supabase
                .from('ingredients')
                .insert([{
                    name: food.label,
                    unit_type: 'g', // Default to grams for API items
                    stock_quantity: 0
                }])
                .select()
                .single();

            if (createError) {
                alert("Error creating new ingredient: " + createError.message);
                return;
            }
            ingredientId = newIng.id;
            fetchPantryItems(); // Refresh the list
        }

        // 3. Link this ingredient to the current recipe
        addIngredientToRecipe(ingredientId);
    }

    async function fetchRecipeIngredients(recipeId) {
        const { data } = await supabase
            .from('recipe_ingredients')
            .select(`
                amount,
                ingredients:ingredient_id (id, name, unit_type)
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

    async function addIngredientToRecipe(ingredientId) {
        const { error } = await supabase
            .from('recipe_ingredients')
            .insert([{
                recipe_id: selectedRecipe.id,
                ingredient_id: ingredientId,
                amount: amount
            }]);

        if (!error) {
            fetchRecipeIngredients(selectedRecipe.id);
            setAmount(1);
        }
    }

    async function addRecipe() {
        if (title === '') return;
        const {error} = await supabase.from('recipes').insert([{ name: title }]);
        if (!error) { setTitle(''); fetchRecipes(); }
    }

    async function removeIngredientFromRecipe(ingredientId) {
        const { error } = await supabase
            .from('recipe_ingredients')
            .delete()
            .eq('recipe_id', selectedRecipe.id)
            .eq('ingredient_id', ingredientId);
        if (!error) fetchRecipeIngredients(selectedRecipe.id);
    }

    async function updateRecipe() {
        if (!selectedRecipe) return;
        const { error } = await supabase
            .from('recipes')
            .update({ description, type, base_servings: baseServings })
            .eq('id', selectedRecipe.id);
        if (!error) { alert("Updated!"); fetchRecipes(); }
    }

    async function deleteRecipe(recipeId) {
        if (!window.confirm("Are you sure?")) return;
        const { error } = await supabase.from('recipes').delete().eq('id', recipeId);
        if (!error) { setSelectedRecipe(null); fetchRecipes(); }
    }

    const handleSelectRecipe = (recipe) => {
        setSelectedRecipe(recipe);
        setType(recipe.type || '');
        setDescription(recipe.description || '');
        setBaseServings(recipe.base_servings || 1);
        fetchRecipeIngredients(recipe.id);
        setSelectedNutrition(null);
    };

    const calculateRecipeNutrition = async (recipeId) => {
        const totals = await getRecipeNutrition(recipeId);
        if (totals) setSelectedNutrition({ id: recipeId, ...totals });
    };

    async function uploadRecipeImage(e) {
        const file = e.target.files[0];
        if (!file || !selectedRecipe) return;
        setUploadingImage(true);
        const fileExt = file.name.split('.').pop();
        const fileName = `${selectedRecipe.id}-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('recipe-images').upload(fileName, file);
        if (!uploadError) {
            const { data } = supabase.storage.from('recipe-images').getPublicUrl(fileName);
            await supabase.from('recipes').update({ image_url: data.publicUrl }).eq('id', selectedRecipe.id);
            setSelectedRecipe({ ...selectedRecipe, image_url: data.publicUrl });
            fetchRecipes();
        }
        setUploadingImage(false);
    }

    return (
        <div className="p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">My Recipes</h2>
                <button onClick={() => setIsVisible(!isVisible)} className="text-xs font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1 rounded-lg">
                    {isVisible ? 'Hide Section ↑' : 'Show Section ↓'}
                </button>
            </div>

            {isVisible && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    {/* Create Recipe Header */}
                    <div className="flex gap-3 mb-8 p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <input
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg outline-none"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Recipe Title (e.g. Pasta)"
                        />
                        <button className="bg-indigo-600 text-white font-bold py-2 px-6 rounded-lg" onClick={addRecipe}>
                            Create Recipe
                        </button>
                    </div>

                    <div className="flex flex-col lg:flex-row gap-8">
                        {/* List Column */}
                        <div className="lg:w-1/3">
                            <h3 className="text-sm font-black uppercase text-gray-400 mb-4">Recipe List</h3>
                            <ul className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
                                {recipes.map(recipe => (
                                    <li key={recipe.id} className={`p-4 rounded-xl border cursor-pointer ${selectedRecipe?.id === recipe.id ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' : 'bg-white border-gray-100'}`} onClick={() => handleSelectRecipe(recipe)}>
                                        {recipe.name}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Detail Column */}
                        <div className="lg:w-2/3 min-h-[400px]">
                            {selectedRecipe ? (
                                <div className="p-6 bg-white rounded-2xl border border-gray-200 shadow-sm animate-in fade-in slide-in-from-right-4">
                                    <div className="flex justify-between items-center mb-6">
                                        <h2 className="text-3xl font-black text-gray-900">{selectedRecipe.name}</h2>
                                        <button onClick={() => calculateRecipeNutrition(selectedRecipe.id)} className="text-xs font-bold bg-indigo-50 text-indigo-600 px-3 py-2 rounded-lg">📊 Nutrition</button>
                                    </div>

                                    {/* Nutrition Box */}
                                    {selectedNutrition && (
                                        <div className="mb-6 p-5 bg-indigo-900 text-white rounded-xl relative">
                                            <div className="grid grid-cols-2 gap-4">
                                                <p>🔥 <strong>{selectedNutrition.calories.toFixed(0)}</strong> kcal</p>
                                                <p>💪 <strong>{selectedNutrition.protein.toFixed(1)}</strong> g Protein</p>
                                            </div>
                                            <button className="absolute top-4 right-4 text-xs" onClick={() => setSelectedNutrition(null)}>✕</button>
                                        </div>
                                    )}

                                    <div className="space-y-6">
                                        {/* Image Box */}
                                        <div className="p-4 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 flex flex-col items-center">
                                            {selectedRecipe.image_url && <img src={selectedRecipe.image_url} className="w-full h-48 object-cover rounded-lg mb-4" alt="Recipe" />}
                                            <label className="cursor-pointer bg-white border px-4 py-2 rounded-lg text-xs font-bold">
                                                {uploadingImage ? 'Uploading...' : 'Upload Photo'}
                                                <input type="file" className="hidden" onChange={uploadRecipeImage} />
                                            </label>
                                        </div>

                                        {/* THE SEARCH COMPONENT REPLACES THE DROPDOWN HERE */}
                                        <div className="p-5 bg-gray-50 rounded-2xl border border-gray-200">
                                            <label className="block text-sm font-black text-gray-400 uppercase mb-4">Add Ingredients from API</label>

                                            <div className="flex items-start gap-3 mb-6">
                                                <div className="flex-1">
                                                    <IngredientSearch onSelect={handleApiIngredientSelect} />
                                                </div>
                                                <div className="w-24">
                                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Amount</label>
                                                    <input
                                                        type="number"
                                                        className="w-full p-3 border border-gray-300 rounded-lg text-sm outline-none"
                                                        value={amount}
                                                        onChange={(e) => setAmount(Number(e.target.value))}
                                                    />
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                {recipeIngredients.map((ing) => (
                                                    <div key={ing.id} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-gray-200 text-sm font-medium">
                                                        <span className="font-bold text-indigo-600">{ing.amount}{ing.unit_type}</span>
                                                        <span className="text-gray-700">{ing.name}</span>
                                                        <button onClick={() => removeIngredientFromRecipe(ing.id)} className="text-gray-300 hover:text-red-500 ml-1">✕</button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Instructions & Category */}
                                        <div>
                                            <label className="block text-sm font-black text-gray-400 uppercase mb-2">Instructions</label>
                                            <textarea
                                                className="w-full min-h-[150px] p-4 bg-gray-50 border rounded-xl outline-none"
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                placeholder="Steps to cook..."
                                            />
                                        </div>

                                        <button className="w-full bg-emerald-600 text-white font-black py-3 rounded-xl shadow-lg" onClick={updateRecipe}>
                                            Save Changes
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-100 rounded-3xl p-12 text-center text-gray-400">
                                    Select a recipe to start...
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Recipes;