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

        const {error} = await supabase
            .from('recipes')
            .insert([{name: title}]);

        if (!error) {
            setTitle('');
            fetchRecipes();
        }
    }

    async function addIngredientToRecipe(ingredientId) {
        if (!selectedRecipe) return;

        const {error} = await supabase
            .from('recipe_ingredients')
            .insert([{
                recipe_id: selectedRecipe.id,
                ingredient_id: ingredientId,
                amount: amount
            }]);

        if (!error) {
            setAmount(1); // Reset to 1
            fetchRecipeIngredients(selectedRecipe.id);
        }

        if (error) {
            alert("Error: " + error.message);
            console.error("Error linking ingredient:", error.message);
        } else {
            fetchRecipeIngredients(selectedRecipe.id);
        }
    }

    async function fetchRecipeIngredients(recipeId) {
        // We tell Supabase: "Get the rows from the bridge,
        // and for each 'ingredient_id', fetch the matching 'ingredients' record."
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

        if (error) {
            console.error("Fetch error:", error.message);
        }

        if (data) {
            // MERGE THE DATA HERE:
            // This takes the ingredient info and adds the specific 'amount' to it
            const mergedData = data.map(item => ({
                ...item.ingredients, // gets id, name, unit_type, stock_quantity
                amount: item.amount  // adds the amount from the bridge table
            }));

            setRecipeIngredients(mergedData);
        }
    }

    async function removeIngredientFromRecipe(ingredientId) {
        const { error } = await supabase
            .from('recipe_ingredients')
            .delete()
            .eq('recipe_id', selectedRecipe.id)
            .eq('ingredient_id', ingredientId);

        if (error) {
            console.error("Error removing ingredient:", error.message);
        } else {
            fetchRecipeIngredients(selectedRecipe.id); // Refresh the card list
        }
    }

    async function updateRecipe() {
        if (!selectedRecipe) return;

        const { error } = await supabase
            .from('recipes')
            .update({ description: description,
                             type: type}) // Update the description column
            .eq('id', selectedRecipe.id);

        if (error) {
            alert("Error updating recipe: " + error.message);
        } else {
            alert("Recipe updated!");
            fetchRecipes(); // Refresh the main list to show new data
        }
    }

    async function uploadRecipeImage(event) {
        try {
            setUploadingImage(true);
            if (!event.target.files || event.target.files.length === 0) {
                throw new Error('You must select an image to upload.');
            }

            const file = event.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`; // Create a unique name
            const filePath = `recipes/${fileName}`;

            // 1. Upload to the bucket
            let { error: uploadError } = await supabase.storage
                .from('recipe-images')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // 2. Get the URL to display the image
            const { data } = supabase.storage
                .from('recipe-images')
                .getPublicUrl(filePath);

            const publicUrl = data.publicUrl;

            // 3. Save that URL into the database column
            const { error: recipeUpdateError } = await supabase
                .from('recipes')
                .update({ image_url: publicUrl }) // Update the new column we added
                .eq('id', selectedRecipe.id);

            if (recipeUpdateError) throw recipeUpdateError;

            const { error: insertError } = await supabase
                .from('recipe_images')
                .insert([{
                    recipe_id: selectedRecipe.id,
                    image_url: publicUrl
                }]);

            if (insertError) throw insertError;

            fetchRecipeGallery(selectedRecipe.id);

        } catch (error) {
            alert(error.message);
        } finally {
            setUploadingImage(false);
        }
    }

    async function fetchRecipeGallery(recipeId) {
        const { data, error } = await supabase
            .from('recipe_images')
            .select('*')
            .eq('recipe_id', recipeId);

        if (error) {
            console.error("Error fetching gallery:", error.message);
        } else {
            console.log("Current Gallery Data from DB:", data);
            setRecipeGallery(data || []);
        }
    }

    async function deleteImage(imageId, imageUrl, recipeId) {
        if (!window.confirm("Are you sure you want to delete this image?")) return;

        try {
            // 1. Prepare the storage path
            const pathParts = imageUrl.split('recipe-images/');
            const filePath = pathParts[pathParts.length - 1].split('?')[0];

            // 2. Delete from Database FIRST (This is more reliable for the UI)
            const { error: dbError } = await supabase
                .from('recipe_images')
                .delete()
                .eq('id', imageId);

            if (dbError) throw dbError;

            // 3. Delete from Storage (If this fails, the row is already gone, so UI stays clean)
            const { error: storageError } = await supabase.storage
                .from('recipe-images')
                .remove([filePath]);

            if (storageError) {
                console.warn("Storage cleanup failed, but DB row was removed:", storageError.message);
            }

            // 4. Update the UI state manually to be 100% sure it disappears
            setRecipeGallery((prev) => prev.filter((img) => img.id !== imageId));
            // console.log('Removing gallery: ', recipeGallery.map());

        } catch (error) {
            console.error("Delete sequence failed:", error);
            alert("Error: " + error.message);
        }
    }

    async function deleteRecipe(recipeId) {
        if (!window.confirm("Are you sure? This will permanently delete the recipe, all its images, and remove it from all meal plans.")) return;

        try {
            // 1. Loop through the gallery and delete files from Storage
            for (const img of recipeGallery) {
                const pathParts = img.image_url.split('recipe-images/');
                const filePath = pathParts[pathParts.length - 1].split('?')[0];

                await supabase.storage
                    .from('recipe-images')
                    .remove([filePath]);
            }

            // 2. Delete database links (Cleanup)
            await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
            await supabase.from('recipe_images').delete().eq('recipe_id', recipeId);
            await supabase.from('plan_recipes').delete().eq('recipe_id', recipeId);

            // 3. Delete the main recipe
            const { error } = await supabase
                .from('recipes')
                .delete()
                .eq('id', recipeId);

            if (error) throw error;

            // 4. Update UI
            setSelectedRecipe(null);
            setRecipeGallery([]); // Clear gallery state
            fetchRecipes();
            alert("Recipe and all associated files deleted! 🗑️");
        } catch (error) {
            console.error("Delete failed:", error);
            alert("Error during deletion: " + error.message);
        }
    }

    const calculateRecipeNutrition = async (recipeId) => {
        // Use the centralized helper instead of writing the query here
        const totals = await getRecipeNutrition(recipeId);

        if (totals) {
            setSelectedNutrition({
                id: recipeId,
                ...totals
            });
        }
        return totals;
    };

    return (
        <div className={styles.recipesSection}>
            <h2 className={styles.title}>My Recipes</h2>
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
                                onClick={() => {
                                    setSelectedRecipe(recipe);
                                    setType(recipe.type || '');
                                    setDescription(recipe.description || '');
                                    fetchRecipeIngredients(recipe.id);
                                    fetchRecipeGallery(recipe.id);
                                }}
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
                            <button
                                onClick={() => calculateRecipeNutrition(selectedRecipe.id)}
                                className={styles.calcButton}
                            >
                                📊 Show Nutrition
                            </button>
                            {/* Nutrition Card - only appears if this recipe was clicked */}
                            {selectedNutrition && selectedNutrition.id === selectedRecipe.id && (
                                <div className={styles.nutritionCard}>
                                    <h4>Nutritional Information</h4>
                                    <div className={styles.macroGrid}>
                                        <p>🔥 <strong>Calories:</strong> {selectedNutrition.calories.toFixed(0)}</p>
                                        <p>💪 <strong>Protein:</strong> {selectedNutrition.protein.toFixed(1)}g</p>
                                        <p>🥑 <strong>Fat:</strong> {selectedNutrition.fat.toFixed(1)}g</p>
                                        <p>🍞 <strong>Fiber:</strong> {selectedNutrition.fiber.toFixed(1)}g</p>
                                    </div>
                                    <button onClick={() => setSelectedNutrition(null)}>Close</button>
                                </div>
                            )}
                            {type && (
                                <div className={styles.categoryBadge}>
                                    {RECIPE_TYPES.find(t => t.value === type)?.label || type}
                                </div>
                            )}

                            <label style={{display: 'block', marginBottom: '5px'}}>Change Category:</label>
                            <select
                                className={styles.inputField}
                                style={{marginBottom: '20px'}}
                                value={type}
                                onChange={(e) => setType(e.target.value)}
                            >
                                <option value="">-- Select Type --</option>
                                {RECIPE_TYPES.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>

                            <div className={styles.galleryGrid}>
                                {recipeGallery.map((img) => (
                                    <div key={img.id} className={styles.imageWrapper}>
                                        <img src={img.image_url} alt="Recipe" className={styles.recipeImage} />
                                        <button
                                            className={styles.deleteImgBtn}
                                            onClick={() => deleteImage(img.id, img.image_url)}
                                        >✕</button>
                                    </div>
                                ))}
                                {recipeGallery.length === 0 && <p style={{ color: '#888', fontStyle: 'italic' }}>No images yet.</p>}
                            </div>

                            <label style={{ display: 'block', marginBottom: '10px', fontSize: '14px' }}>
                                {uploadingImage ? "Uploading..." : "Add to Gallery:"}
                                <input type="file" accept="image/*" onChange={uploadRecipeImage} disabled={uploadingImage} />
                            </label>

                            <label>Instructions:</label>
                            <textarea
                                className={styles.instructionsArea}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Steps to cook..."
                            />
                            <button className={styles.createBtn} onClick={updateRecipe}>Save Changes</button>

                            <hr style={{margin: '20px 0', border: 'none', borderTop: '1px solid #eee'}}/>
                            <h4>Ingredients:</h4>
                            <ul className={styles.ingredientList}>
                                {recipeIngredients.map((ing) => (
                                    <li key={ing.id} className={styles.ingredientItem}>
                                        <span>
                                            {/* Shows: "200g Rice" or "15ml Olive Oil" */}
                                            <strong>{ing.amount} {ing.unit_type}</strong> of <strong>{ing.name}</strong>
                                            <small style={{ marginLeft: '10px', color: '#666' }}>
                                                (Pantry Stock: {ing.stock_quantity})
                                            </small>
                                        </span>
                                        <button
                                            style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer' }}
                                            onClick={() => removeIngredientFromRecipe(ing.id)}
                                        >
                                            Remove
                                        </button>
                                    </li>
                                ))}
                            </ul>

                            <label style={{display: 'block', marginTop: '15px'}}>Add Ingredient:</label>
                            <div className={styles.addIngredientRow}>
                                <input
                                    type="number"
                                    placeholder="Amount"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    className={styles.qtyInput}
                                />

                                <select
                                    className={styles.inputField}
                                    value=""
                                    onChange={(e) => addIngredientToRecipe(e.target.value)}
                                >
                                    <option value="" disabled>+ Add Ingredient...</option>
                                    {pantryItems.map(item => (
                                        <option key={item.id} value={item.id}>
                                            {item.name} ({item.unit_type})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className={styles.footerButtons}>
                                <button className={styles.navButton} onClick={() => setSelectedRecipe(null)}>Close</button>
                                <button
                                    className={styles.deleteRecipeBtn}
                                    onClick={() => deleteRecipe(selectedRecipe.id)}
                                >🗑️ Delete Recipe</button>
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