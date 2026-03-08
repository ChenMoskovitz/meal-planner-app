import React, { useState, useEffect } from 'react';
import { supabase } from '../../config/supabaseClient.js';
import styles from './Pantry.module.css';
import fetchNutrition from '../../utils/apiTest.js';
import { formatIngredientNutrition } from '../../utils/nutritionHelper.js';

function Pantry() {
    const [name, setName] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [ingredients, setIngredients] = useState([]);

    // 1. ADD THIS STATE: For the dropdown to work
    const [unitType, setUnitType] = useState('g');

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

        // 2. CONSOLIDATED UPSERT: Use one call to save everything including unit_type
        const { error } = await supabase.from('ingredients').upsert({
            name,
            stock_quantity: finalQuantity,
            unit_type: unitType // Saves 'g' or 'ml'
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
            // This object now holds: calories, protein, fat, fiber
            const nutrients = formatIngredientNutrition(foodData.nutrients);

            const { error } = await supabase
                .from('ingredients')
                .update({
                    // FIX: access the values through the 'nutrients' object
                    calories_per_unit: nutrients.calories,
                    unit_type: unitType,
                    protein_per_unit: nutrients.protein,
                    fat_per_unit: nutrients.fat,
                    fiber_per_unit: nutrients.fiber
                })
                .eq('id', item.id);

            if (!error) {
                // FIX: update the alert to use nutrients.calories
                alert(`Updated! 1${unitType} of ${item.name} is ${nutrients.calories.toFixed(4)} kcal.`);
                fetchIngredients();
            } else {
                console.error("Error updating database:", error);
            }
        }
    };

    return (
        <div className={styles.pantrySection}>
            <h2 className={styles.title}>My Pantry</h2>

            <div className={styles.inputGroup}>
                <input
                    className={`${styles.inputField} ${styles.nameInput}`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ingredient Name"
                />
                <input
                    className={`${styles.inputField} ${styles.qtyInput}`}
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                />

                {/* 4. THE DROPDOWN: Matches your state */}
                <select
                    className={styles.unitSelect}
                    value={unitType}
                    onChange={(e) => setUnitType(e.target.value)}
                >
                    <option value="g">Grams (g)</option>
                    <option value="ml">Milliliters (ml)</option>
                </select>

                <button className={styles.addButton} onClick={addIngredient}>Add Item</button>
            </div>

            <ul className={styles.ingredientList}>
                {ingredients.map(item => (
                    <li key={item.id} className={styles.ingredientItem}>
                        <span>
                            <strong>{item.name}</strong>
                            {/* 5. DISPLAY UNIT: Show g or ml next to stock */}
                            <span className={styles.stockBadge}>Stock: {item.stock_quantity}{item.unit_type}</span>
                        </span>
                        <div className={styles.actions}>
                            <button
                                onClick={() => handleFetchNutrition(item)}
                                className={styles.pantryButton}
                            >
                                🔍 Get Info
                            </button>
                            <button className={styles.deleteBtn} onClick={() => deleteIngredient(item.id)}>✕</button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default Pantry;