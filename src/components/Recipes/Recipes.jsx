import React, {useState, useEffect, useRef} from 'react';
import {supabase} from '../../config/supabaseClient.js';
import { getRecipeNutrition } from '../../utils/nutritionHelper.js';
import IngredientSearch from '../IngredientSearch';

const IMAGE_BUCKET = 'recipe-images';
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_IMAGE_MB = 5;

// ".../object/public/recipe-images/<name>" -> "<name>"
function storageNameFromUrl(url) {
    if (!url) return null;
    const marker = `/${IMAGE_BUCKET}/`;
    const at = url.indexOf(marker);
    if (at === -1) return null;
    return decodeURIComponent(url.slice(at + marker.length).split('?')[0]);
}

function Recipes() {
    const [recipes, setRecipes] = useState([]);
    const [title, setTitle] = useState('');
    const [type, setType] = useState('');
    const [selectedRecipe, setSelectedRecipe] = useState(null);
    const [recipeIngredients, setRecipeIngredients] = useState([]);
    const [description, setDescription] = useState('');
    const [uploadingImage, setUploadingImage] = useState(false);
    const [amount, setAmount] = useState(1);
    const [selectedNutrition, setSelectedNutrition] = useState(null);
    const [baseServings, setBaseServings] = useState(1);
    const [isVisible, setIsVisible] = useState(true);
    const [errors, setErrors] = useState({ name: false, amount: false });
    const [lastSelectedFood, setLastSelectedFood] = useState(null);
    const [newRecipeType, setNewRecipeType] = useState('');
    const [ingredientsError, setIngredientsError] = useState(null);
    const [editName, setEditName] = useState('');
    const [nameError, setNameError] = useState(false);
    const [titleError, setTitleError] = useState(false);
    const [editingIngredientId, setEditingIngredientId] = useState(null);
    const [editingAmount, setEditingAmount] = useState('');
    const cancelAmountEditRef = useRef(false);
    const unitLookupRef = useRef(0);
    const [imageError, setImageError] = useState(null);
    const [selectedUnit, setSelectedUnit] = useState('g');
    const [actionStatus, setActionStatus] = useState(null); // { kind: 'success' | 'error', message }
    const [createError, setCreateError] = useState(null);

    const showError = (message) => setActionStatus({ kind: 'error', message });
    const showSuccess = (message) => setActionStatus({ kind: 'success', message });

    const RECIPE_TYPES = [
        { value: 'full_meal', label: 'Full Meal' },
        { value: 'main_dish', label: 'Main Dish' },
        { value: 'side', label: 'Side' },
        { value: 'vegetable_side', label: 'Vegetable Side' }
    ];

    useEffect(() => {
        fetchRecipes();
    }, []);

    async function fetchRecipes() {
        const {data, error} = await supabase
            .from('recipes')
            .select('*')
            .order('name', { ascending: true });
        // Supabase reports failures in `error` rather than throwing, so an
        // unchecked call fails silently and leaves the screen blank.
        if (error) console.error('Failed to load recipes:', error);
        if (data) setRecipes(data);
    }

    async function fetchRecipeIngredients(recipeId) {
        const { data, error } = await supabase
            .from('recipe_ingredients')
            .select(`
            amount,
            ingredients:ingredient_id (
                id,
                name,
                unit_type
            )
        `)
            .eq('recipe_id', recipeId);

        if (error) {
            console.error('Failed to load recipe ingredients:', error);
            setIngredientsError("Couldn't load this recipe's ingredients.");
            setRecipeIngredients([]); // don't leave the previous recipe's bubbles on screen
            return;
        }

        setIngredientsError(null);

        if (data) {
            const mergedData = data.map(item => ({
                ...item.ingredients,
                amount: item.amount,
            }));
            setRecipeIngredients(mergedData);
        }
    }

    async function addIngredientToRecipe(ingredientId) {
        setActionStatus(null);

        // Already in this recipe? Add to the existing amount rather than creating
        // a second row, the same way Pantry.jsx merges repeat quantities.
        const { data: existing, error: lookupError } = await supabase
            .from('recipe_ingredients')
            .select('amount')
            .eq('recipe_id', selectedRecipe.id)
            .eq('ingredient_id', ingredientId)
            .limit(1);

        // Treating a failed lookup as "not here yet" would insert a second row.
        if (lookupError) {
            console.error('Failed to check for an existing ingredient row:', lookupError);
            showError("Couldn't add that ingredient. Try again.");
            return;
        }

        const existingRow = existing?.[0];

        const { error } = existingRow
            ? await supabase
                .from('recipe_ingredients')
                .update({ amount: Number(existingRow.amount) + Number(amount) })
                .eq('recipe_id', selectedRecipe.id)
                .eq('ingredient_id', ingredientId)
            : await supabase
                .from('recipe_ingredients')
                .insert([{
                    recipe_id: selectedRecipe.id,
                    ingredient_id: ingredientId,
                    amount: amount
                }]);

        if (error) {
            console.error('Failed to add ingredient:', error);
            showError("Couldn't add that ingredient. Try again.");
        }

        if (!error) {
            fetchRecipeIngredients(selectedRecipe.id);
            setAmount(1);
            // Keep an open nutrition box in step with the new ingredient list.
            if (selectedNutrition) calculateRecipeNutrition(selectedRecipe.id);
        }
    }

    async function addRecipe() {
        const trimmedTitle = title.trim();
        if (!trimmedTitle) {
            setTitleError(true);
            return;
        }
        setTitleError(false);

        setCreateError(null);

        const {error} = await supabase.from('recipes').insert([{ name: trimmedTitle, type: newRecipeType || null }]);

        if (error) {
            console.error('Failed to create recipe:', error);
            setCreateError("Couldn't create that recipe. Try again.");
            return;
        }

        setTitle('');
        setNewRecipeType('');
        fetchRecipes();
    }

    // The Qty box used to claim grams for everything. An ingredient added
    // through the Pantry may be in ml, and the search reuses it by name.
    async function lookupIngredientUnit(name) {
        const lookupId = ++unitLookupRef.current;
        setSelectedUnit('g'); // what a new ingredient will be created as

        const { data, error } = await supabase
            .from('ingredients')
            .select('unit_type')
            .eq('name', name)
            .limit(1);

        // A newer selection started while this was in flight, so this answer is
        // stale — dropping it stops a slow reply overwriting a fresher one.
        if (lookupId !== unitLookupRef.current) return;

        if (error) {
            console.error('Failed to look up the ingredient unit:', error);
            return;
        }

        if (data?.[0]?.unit_type) setSelectedUnit(data[0].unit_type);
    }

    async function saveIngredientAmount(ingredientId, rawValue) {
        setEditingIngredientId(null);
        setActionStatus(null);

        // Escape sets this so the blur that follows doesn't save anyway.
        if (cancelAmountEditRef.current) {
            cancelAmountEditRef.current = false;
            return;
        }

        const nextAmount = Number(rawValue);
        if (!Number.isFinite(nextAmount) || nextAmount <= 0) return;

        const current = recipeIngredients.find(i => i.id === ingredientId);
        if (current && Number(current.amount) === nextAmount) return;

        const { error } = await supabase
            .from('recipe_ingredients')
            .update({ amount: nextAmount })
            .eq('recipe_id', selectedRecipe.id)
            .eq('ingredient_id', ingredientId);

        if (error) {
            console.error('Failed to update ingredient amount:', error);
            showError("Couldn't update that amount. Try again.");
        }

        if (!error) {
            fetchRecipeIngredients(selectedRecipe.id);
            if (selectedNutrition) calculateRecipeNutrition(selectedRecipe.id);
        }
    }

    async function removeIngredientFromRecipe(ingredientId) {
        setActionStatus(null);

        const { error } = await supabase
            .from('recipe_ingredients')
            .delete()
            .eq('recipe_id', selectedRecipe.id)
            .eq('ingredient_id', ingredientId);

        if (error) {
            console.error('Failed to remove ingredient:', error);
            showError("Couldn't remove that ingredient. Try again.");
        }

        if (!error) {
            fetchRecipeIngredients(selectedRecipe.id);
            if (selectedNutrition) calculateRecipeNutrition(selectedRecipe.id);
        }
    }

    async function updateRecipe() {
        if (!selectedRecipe) return;
        setActionStatus(null);

        const trimmedName = editName.trim();
        if (!trimmedName) {
            setNameError(true);
            return;
        }
        setNameError(false);

        const { error } = await supabase
            .from('recipes')
            .update({
                name: trimmedName,
                description,
                type: type || null,
                base_servings: baseServings
            })
            .eq('id', selectedRecipe.id);

        if (error) {
            console.error("Error updating recipe:", error);
            showError("Couldn't save this recipe. Try again.");
            return;
        }

        // Keep the heading and the list in step with the saved name.
        setSelectedRecipe({ ...selectedRecipe, name: trimmedName });
        setEditName(trimmedName);

        showSuccess('Recipe saved.');
        fetchRecipes();
    }

    async function deleteRecipe(recipeId) {
        const recipe = recipes.find(r => r.id === recipeId);
        if (!window.confirm(`Delete "${recipe?.name || 'this recipe'}"? This can't be undone.`)) return;

        setActionStatus(null);

        const { error } = await supabase.from('recipes').delete().eq('id', recipeId);

        if (error) {
            console.error('Failed to delete recipe:', error);
            showError("Couldn't delete this recipe. Try again.");
            return;
        }

        // Its image is unreachable now, so don't leave it in storage.
        const imageName = storageNameFromUrl(recipe?.image_url);
        if (imageName) {
            const { error: removeError } = await supabase.storage.from(IMAGE_BUCKET).remove([imageName]);
            if (removeError) console.error('Failed to remove the deleted recipe image:', removeError);
        }

        setSelectedRecipe(null);
        fetchRecipes();
    }

    async function handleApiIngredientSelect(food) {
        if (!selectedRecipe) return;
        setActionStatus(null);

        // 1. THE GUARD: Check validation before anything else
        // Reset errors first
        setErrors({ name: false, amount: false });

        if (!amount || amount <= 0) {
            setErrors(prev => ({ ...prev, amount: true }));
            return; // STOP: Don't create or link anything if amount is missing
        }

        // 2. Check if this ingredient already exists.
        // limit(1) rather than maybeSingle(), which errors outright when two
        // ingredients share a name instead of just picking one.
        const { data: existingRows, error: lookupError } = await supabase
            .from('ingredients')
            .select('id')
            .eq('name', food.label)
            .limit(1);

        if (lookupError) {
            console.error('Failed to look up the ingredient:', lookupError);
            showError("Couldn't add that ingredient. Try again.");
            return;
        }

        const existingIng = existingRows?.[0];
        let ingredientId;

        if (existingIng) {
            ingredientId = existingIng.id;
        } else {
            // 3. Create it with Nutrition data from the API
            const { data: newIng, error: createError } = await supabase
                .from('ingredients')
                .insert([{
                    name: food.label,
                    unit_type: 'g',
                    stock_quantity: 0,
                    calories_per_unit: food.nutrients?.ENERC_KCAL || 0,
                    protein_per_unit: food.nutrients?.PROCNT || 0,
                    fat_per_unit: food.nutrients?.FAT || 0,
                    fiber_per_unit: food.nutrients?.FIBTG || 0
                }])
                .select()
                .single();

            if (createError) {
                console.error("Insert error:", createError.message);
                showError("Couldn't add that ingredient. Try again.");
                return;
            }
            ingredientId = newIng.id;
        }

        // 4. Link it to the recipe
        await addIngredientToRecipe(ingredientId);

        // 5. SUCCESS: Clear errors after successful add
        setErrors({ name: false, amount: false });
    }

    const handleSelectRecipe = (recipe) => {
        setSelectedRecipe(recipe);
        setEditName(recipe.name || '');
        setNameError(false);
        setEditingIngredientId(null);
        setImageError(null);
        setSelectedUnit('g');
        setLastSelectedFood(null);
        setErrors({ name: false, amount: false });
        setActionStatus(null);
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
        e.target.value = ''; // so the same file can be picked again after a failure
        if (!file || !selectedRecipe) return;

        setImageError(null);

        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            setImageError('Choose a JPEG, PNG, WebP or GIF image.');
            return;
        }

        if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
            const sizeMb = (file.size / 1024 / 1024).toFixed(1);
            setImageError(`That image is ${sizeMb}MB. The limit is ${MAX_IMAGE_MB}MB.`);
            return;
        }

        setUploadingImage(true);

        const previousUrl = selectedRecipe.image_url;
        const fileExt = file.name.split('.').pop();
        const fileName = `${selectedRecipe.id}-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage.from(IMAGE_BUCKET).upload(fileName, file);

        if (uploadError) {
            console.error('Failed to upload recipe image:', uploadError);
            setImageError("Couldn't upload that image. Try again.");
            setUploadingImage(false);
            return;
        }

        const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(fileName);

        const { error: updateError } = await supabase
            .from('recipes')
            .update({ image_url: data.publicUrl })
            .eq('id', selectedRecipe.id);

        if (updateError) {
            console.error('Failed to save the recipe image URL:', updateError);
            setImageError("Uploaded, but couldn't attach the image to the recipe.");
            setUploadingImage(false);
            return;
        }

        // The old file is unreachable once the recipe points elsewhere, so
        // don't leave it sitting in storage forever.
        const previousName = storageNameFromUrl(previousUrl);
        if (previousName && previousName !== fileName) {
            const { error: removeError } = await supabase.storage.from(IMAGE_BUCKET).remove([previousName]);
            if (removeError) console.error('Failed to remove the previous recipe image:', removeError);
        }

        setSelectedRecipe({ ...selectedRecipe, image_url: data.publicUrl });
        fetchRecipes();
        setUploadingImage(false);
    }

    return (
        <div className="p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900 font-black italic underline decoration-indigo-500">My Recipes</h2>
                <button onClick={() => setIsVisible(!isVisible)} className="text-xs font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1 rounded-lg transition-colors">
                    {isVisible ? 'Hide Section ↑' : 'Show Section ↓'}
                </button>
            </div>

            {isVisible && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    {/* Create Recipe Header */}
                    <div className="mb-8 p-4 bg-gray-50 rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex gap-3">
                            <input
                                className={`flex-1 px-4 py-2 border rounded-lg outline-none transition-colors ${
                                    titleError ? 'border-red-500 bg-red-50' : 'border-gray-300 focus:border-indigo-500'
                                }`}
                                value={title}
                                onChange={(e) => {
                                    setTitle(e.target.value);
                                    if (titleError) setTitleError(false);
                                    if (createError) setCreateError(null);
                                }}
                                placeholder="Recipe Title (e.g. Pasta)"
                            />
                            <select
                                aria-label="New Recipe Type"
                                className="px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-indigo-500 transition-colors bg-white text-gray-700"
                                value={newRecipeType}
                                onChange={(e) => setNewRecipeType(e.target.value)}
                            >
                                <option value="">Type (optional)</option>
                                {RECIPE_TYPES.map(t => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                            <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg transition-all active:scale-95" onClick={addRecipe}>
                                Create Recipe
                            </button>
                        </div>

                        {titleError && (
                            <p className="text-red-500 text-[10px] font-bold mt-2 ml-1">⚠️ Give the recipe a title first</p>
                        )}

                        {createError && (
                            <p className="text-red-600 text-xs font-bold mt-2 ml-1">{createError}</p>
                        )}
                    </div>

                    <div className="flex flex-col lg:flex-row gap-8">
                        {/* List Column */}
                        <div className="lg:w-1/3">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4">Recipe List</h3>
                            <ul className="space-y-2 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                                {recipes.map(recipe => (
                                    <li key={recipe.id}
                                        className={`p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md ${selectedRecipe?.id === recipe.id ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold' : 'bg-white border-gray-100'}`}
                                        onClick={() => handleSelectRecipe(recipe)}>
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
                                        <h2 className="text-3xl font-black text-gray-900">
                                            {selectedRecipe.name}
                                        </h2>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => calculateRecipeNutrition(selectedRecipe.id)}
                                                className="text-xs font-bold bg-indigo-50 text-indigo-600 px-4 py-2 rounded-lg hover:bg-indigo-100 transition-colors"
                                            >
                                                📊 Nutrition
                                            </button>

                                            <button
                                                onClick={() => deleteRecipe(selectedRecipe.id)}
                                                className="text-xs font-bold bg-red-50 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100 transition-colors"
                                            >
                                                🗑 Delete
                                            </button>

                                            <button
                                                aria-label="Close selected recipe"
                                                onClick={() => setSelectedRecipe(null)}
                                                className="text-xs font-bold bg-gray-100 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>

                                    {actionStatus && (
                                        <div className={`flex items-center justify-between gap-3 mb-4 px-4 py-2 rounded-lg text-xs font-bold ${
                                            actionStatus.kind === 'success'
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : 'bg-red-50 text-red-700'
                                        }`}>
                                            <span>{actionStatus.message}</span>
                                            <button
                                                aria-label="Dismiss message"
                                                onClick={() => setActionStatus(null)}
                                                className="opacity-50 hover:opacity-100"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )}

                                    {/* Nutrition Box */}
                                    {selectedNutrition && (
                                        <div className="mb-6 p-5 bg-indigo-900 text-white rounded-xl relative shadow-lg animate-in zoom-in-95">
                                            <div className="grid grid-cols-2 gap-4">
                                                <p className="text-lg font-bold italic">🔥 <strong>{selectedNutrition.calories.toFixed(0)}</strong> <span className="text-xs font-normal">kcal</span></p>
                                                <p className="text-lg font-bold italic">💪 <strong>{selectedNutrition.protein.toFixed(1)}</strong> <span className="text-xs font-normal">g Protein</span></p>
                                                <p className="text-lg font-bold italic">🥑 <strong>{selectedNutrition.fat.toFixed(1)}</strong> <span className="text-xs font-normal">g Fat</span></p>
                                                <p className="text-lg font-bold italic">🌾 <strong>{selectedNutrition.fiber.toFixed(1)}</strong> <span className="text-xs font-normal">g Fiber</span></p>
                                            </div>
                                            <button className="absolute top-4 right-4 text-xs opacity-50 hover:opacity-100" onClick={() => setSelectedNutrition(null)}>✕</button>
                                        </div>
                                    )}

                                    <div className="space-y-6">
                                        {/* Image Box */}
                                        <div className="p-4 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 flex flex-col items-center">
                                            {selectedRecipe.image_url && <img src={selectedRecipe.image_url} className="w-full h-48 object-cover rounded-lg mb-4 shadow-sm" alt="Recipe" />}
                                            <label className="cursor-pointer bg-white border border-gray-200 px-6 py-2 rounded-lg text-xs font-black uppercase tracking-wider shadow-sm hover:bg-gray-50 transition-colors">
                                                {uploadingImage ? 'Uploading...' : 'Upload Photo'}
                                                <input
                                                    type="file"
                                                    accept={ALLOWED_IMAGE_TYPES.join(',')}
                                                    className="hidden"
                                                    onChange={uploadRecipeImage}
                                                />
                                            </label>

                                            {imageError && (
                                                <p className="text-red-600 text-xs font-bold mt-2 text-center">{imageError}</p>
                                            )}
                                        </div>

                                        {/* INGREDIENT SEARCH & ADD SECTION */}
                                        <div className="p-5 bg-gray-50 rounded-2xl border border-gray-200 shadow-inner">
                                            <label className="block text-sm font-black text-gray-400 uppercase mb-4 tracking-tighter">Add Ingredients from API</label>

                                            <div className="flex items-end gap-3 mb-6">
                                                <div className="flex-1">
                                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">Search Food</label>
                                                    <IngredientSearch key={selectedRecipe.id} hideLabel onSelect={(food) => {
                                                        setLastSelectedFood(food);
                                                        setErrors(prev => ({ ...prev, name: false })); // Clear the "name" error once picked
                                                        lookupIngredientUnit(food.label);
                                                    }} />
                                                </div>
                                                <div className="w-24">
                                                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 ml-1">Qty ({selectedUnit})</label>
                                                    <input
                                                        type="number"
                                                        value={amount}
                                                        onChange={(e) => setAmount(Number(e.target.value))}
                                                        className={`w-full h-[42px] px-3 border rounded-xl outline-none transition-all ${
                                                            errors.amount ? 'border-red-500 bg-red-50' : 'border-gray-300'
                                                        }`}
                                                        placeholder="0"
                                                    />
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        if (!lastSelectedFood) {
                                                            setErrors(prev => ({ ...prev, name: true }));
                                                            return;
                                                        }
                                                        handleApiIngredientSelect(lastSelectedFood);
                                                        setLastSelectedFood(null); // Clear it after adding so the same item isn't added twice by mistake
                                                        setSelectedUnit('g');
                                                    }}
                                                    className="h-[42px] px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm transition-all active:scale-95"
                                                >
                                                    Add
                                                </button>
                                            </div>

                                            {errors.amount && <p className="text-red-500 text-[10px] font-bold -mt-4 mb-4 ml-1 animate-pulse">⚠️ Enter amount first</p>}
                                            {errors.name && <p className="text-red-500 text-[10px] font-bold -mt-4 mb-4 ml-1 animate-pulse">⚠️ Search and click an item first</p>}

                                            {ingredientsError && (
                                                <p className="text-red-600 text-xs font-bold mb-2">{ingredientsError}</p>
                                            )}

                                            {/* Ingredient Bubbles */}
                                            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                                                {recipeIngredients.map((ing) => (
                                                    <div key={ing.id} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-gray-200 text-xs font-bold shadow-sm group">
                                                        {editingIngredientId === ing.id ? (
                                                            <span className="flex items-center gap-0.5 text-indigo-600">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="any"
                                                                    autoFocus
                                                                    value={editingAmount}
                                                                    onChange={(e) => setEditingAmount(e.target.value)}
                                                                    onBlur={(e) => saveIngredientAmount(ing.id, e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') e.currentTarget.blur();
                                                                        if (e.key === 'Escape') {
                                                                            cancelAmountEditRef.current = true;
                                                                            e.currentTarget.blur();
                                                                        }
                                                                    }}
                                                                    className="w-12 px-1 border border-indigo-300 rounded text-xs font-bold text-indigo-600 outline-none"
                                                                />
                                                                {ing.unit_type}
                                                            </span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                title="Click to change the amount"
                                                                onClick={() => {
                                                                    setEditingIngredientId(ing.id);
                                                                    setEditingAmount(String(ing.amount));
                                                                }}
                                                                className="text-indigo-600 hover:underline"
                                                            >
                                                                {ing.amount}{ing.unit_type}
                                                            </button>
                                                        )}
                                                        <span className="text-gray-700 uppercase tracking-tight">{ing.name}</span>
                                                        <button onClick={() => removeIngredientFromRecipe(ing.id)} className="text-gray-300 hover:text-red-500 transition-colors ml-1">✕</button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Recipe Name */}
                                        <div>
                                            <label
                                                htmlFor="recipe-name"
                                                className="block text-sm font-black text-gray-400 uppercase mb-2 tracking-tighter"
                                            >Recipe Name</label>
                                            <input
                                                id="recipe-name"
                                                type="text"
                                                className={`w-full p-4 bg-gray-50 border rounded-xl outline-none transition-colors shadow-inner ${
                                                    nameError ? 'border-red-500 bg-red-50' : 'border-gray-200 focus:border-indigo-400'
                                                }`}
                                                value={editName}
                                                onChange={(e) => {
                                                    setEditName(e.target.value);
                                                    if (nameError) setNameError(false);
                                                }}
                                            />
                                            {nameError && (
                                                <p className="text-red-500 text-[10px] font-bold mt-1 ml-1">⚠️ Recipe name can't be empty</p>
                                            )}
                                        </div>

                                        {/* Recipe Type */}
                                        <div>
                                            <label
                                                htmlFor="recipe-type"
                                                className="block text-sm font-black text-gray-400 uppercase mb-2 tracking-tighter"
                                            >Recipe Type</label>
                                            <select
                                                id="recipe-type"
                                                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-indigo-400 transition-colors shadow-inner"
                                                value={type}
                                                onChange={(e) => setType(e.target.value)}
                                            >
                                                <option value="">No type set</option>
                                                {RECIPE_TYPES.map(t => (
                                                    <option key={t.value} value={t.value}>{t.label}</option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Base Servings */}
                                        <div>
                                            <label
                                                htmlFor="base-servings"
                                                className="block text-sm font-black text-gray-400 uppercase mb-2 tracking-tighter"
                                            >Servings This Recipe Makes</label>
                                            <input
                                                id="base-servings"
                                                type="number"
                                                min="1"
                                                className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-indigo-400 transition-colors shadow-inner"
                                                value={baseServings}
                                                onChange={(e) => setBaseServings(Number(e.target.value) || 1)}
                                            />
                                            <p className="text-[10px] font-bold text-gray-400 mt-1 ml-1">
                                                Used to calculate nutrition per portion and leftovers.
                                            </p>
                                        </div>

                                        {/* Instructions Section */}
                                        <div>
                                            <label className="block text-sm font-black text-gray-400 uppercase mb-2 tracking-tighter">Cooking Instructions</label>
                                            <textarea
                                                className="w-full min-h-[150px] p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-indigo-400 transition-colors shadow-inner"
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                placeholder="Write your recipe steps here..."
                                            />
                                        </div>

                                        <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-xl shadow-xl transition-all active:scale-95" onClick={updateRecipe}>
                                            SAVE CHANGES
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-100 rounded-3xl p-12 text-center">
                                    <div className="text-5xl mb-4 grayscale">🥗</div>
                                    <h3 className="text-lg font-bold text-gray-400">Select a recipe to start cooking</h3>
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