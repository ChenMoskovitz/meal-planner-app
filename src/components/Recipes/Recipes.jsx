import React, {useState, useEffect} from 'react';
import {supabase} from '../../config/supabaseClient.js';
import styles from './Recipes.module.css';
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
        <div className={styles.recipesSection}>
            <h2 className={styles.title}>My Recipes</h2>

            {/* Top Area: Pure Creation */}
            <div className={styles.createArea}>
                <input
                    className={styles.inputField}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Recipe Title (e.g. Pasta)"
                />
                <button className={styles.createBtn} onClick={addRecipe}>Create Recipe</button>
            </div>

            <div className={styles.mainLayout}>
                {/* Left Side: List */}
                <div className={styles.listSide}>
                    <h3>Recipe List</h3>
                    <ul className={styles.recipeList}>
                        {recipes.map(recipe => (
                            <li
                                key={recipe.id}
                                className={styles.recipeListItem}
                                onClick={() => handleSelectRecipe(recipe)}
                            >
                                {recipe.name}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Right Side: Detail Card */}
                <div className={styles.cardSide}>
                    {selectedRecipe ? (
                        <div>
                            <h2>{selectedRecipe.name}</h2>

                            <div className={styles.buttonRow}>
                                <button onClick={() => calculateRecipeNutrition(selectedRecipe.id)} className={styles.calcButton}>
                                    📊 Show Nutrition
                                </button>
                            </div>

                            {selectedNutrition && selectedNutrition.id === selectedRecipe.id && (
                                <div className={styles.nutritionCard}>
                                    <h4>Nutritional Information (Per Serving)</h4>
                                    <div className={styles.macroGrid}>
                                        <p>🔥 <strong>Calories:</strong> {selectedNutrition.calories.toFixed(0)}</p>
                                        <p>💪 <strong>Protein:</strong> {selectedNutrition.protein.toFixed(1)}g</p>
                                    </div>
                                    <button onClick={() => setSelectedNutrition(null)}>Close</button>
                                </div>
                            )}

                            {/* PORTION INPUT - ONLY HERE */}
                            <div className={styles.inputGroup} style={{marginTop: '20px'}}>
                                <label style={{ fontWeight: 'bold' }}>Servings:</label>
                                <input
                                    type="number"
                                    className={styles.inputField}
                                    value={baseServings}
                                    min="1"
                                    onChange={(e) => setBaseServings(parseInt(e.target.value) || 1)}
                                />
                                <p style={{ fontSize: '12px', color: '#666' }}>How many portions does this full recipe make?</p>
                            </div>

                            <label>Category:</label>
                            <select
                                className={styles.inputField}
                                value={type}
                                onChange={(e) => setType(e.target.value)}
                            >
                                <option value="">-- Select Type --</option>
                                {RECIPE_TYPES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>

                            <label>Instructions:</label>
                            <textarea
                                className={styles.instructionsArea}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Steps to cook..."
                            />

                            <button className={styles.createBtn} onClick={updateRecipe}>Save Changes</button>

                            <hr style={{margin: '20px 0', border: 'none', borderTop: '1px solid #eee'}}/>

                            {/* Rest of your existing Ingredients & Gallery UI goes here... */}

                            <div className={styles.footerButtons}>
                                <button className={styles.navButton} onClick={() => setSelectedRecipe(null)}>Close</button>
                                <button className={styles.deleteRecipeBtn} onClick={() => deleteRecipe(selectedRecipe.id)}>🗑️ Delete</button>
                            </div>
                        </div>
                    ) : (
                        <p style={{textAlign: 'center', color: '#6b7280'}}>Select a recipe to see details</p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Recipes;