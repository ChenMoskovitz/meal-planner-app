import React, { useState } from 'react';
import { supabase } from '../../config/supabaseClient.js';
import styles from './Meals.module.css';
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
        <div className={styles.mealsSection}>
            <h2>🍽️ Meal Generator</h2>
            <button
                onClick={pickRandomMeal}
                disabled={loading}
                className={styles.generateBtn}
            >
                {loading ? 'Searching...' : '🎲 Generate Random Meal'}
            </button>

            {suggestion && (
                <div className={styles.suggestionCard}>
                    <h3>{suggestion.name}</h3>

                    {suggestion.image_url ? (
                        <img
                            src={suggestion.image_url}
                            alt={suggestion.name}
                            className={styles.mainImage}
                        />
                    ) : (
                        <div className={styles.imagePlaceholder}>
                            No image added yet
                        </div>
                    )}

                    {suggestion.type === 'main_dish' && (
                        <div className={styles.buttonGroup}>
                            <button
                                className={styles.sideActionBtn}
                                onClick={() => fetchRandomByType('side', setSideSuggestion)}
                            >
                                🥗 Add a Side
                            </button>
                            <button
                                className={styles.sideActionBtn}
                                onClick={() => fetchRandomByType('vegetable_side', setVegSideSuggestion)}
                            >
                                🥦 Add a Veggie Side
                            </button>
                        </div>
                    )}

                    {sideSuggestion && (
                        <div className={styles.sideSuggestionRow}>
                            {sideSuggestion.image_url && (
                                <img src={sideSuggestion.image_url} className={styles.thumbnail} alt="side" />
                            )}
                            <p><strong>Side:</strong> {sideSuggestion.name}</p>
                        </div>
                    )}

                    {vegSideSuggestion && (
                        <div className={styles.sideSuggestionRow}>
                            {vegSideSuggestion.image_url && (
                                <img src={vegSideSuggestion.image_url} className={styles.thumbnail} alt="veg side" />
                            )}
                            <p><strong>Veggie:</strong> {vegSideSuggestion.name}</p>
                        </div>
                    )}
                    {/* Button to toggle the nutrition view */}
                    <button
                        className={styles.calcButton}
                        onClick={() => setShowNutrition(!showNutrition)}
                    >
                        {showNutrition ? '📊 Hide Nutrition' : '📊 Show Meal Nutrition'}
                    </button>

                    {/* The Nutrition Card */}
                    {showNutrition && (
                        <div className={styles.nutritionCard}>
                            <h4>Meal Combo Totals</h4>
                            <div className={styles.macroGrid}>
                                <p>🔥 <strong>Calories:</strong> {comboNutrition.calories.toFixed(0)}</p>
                                <p>💪 <strong>Protein:</strong> {comboNutrition.protein.toFixed(1)}g</p>
                                <p>🥑 <strong>Fat:</strong> {comboNutrition.fat.toFixed(1)}g</p>
                                <p>🍞 <strong>Fiber:</strong> {comboNutrition.fiber.toFixed(1)}g</p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default Meals;