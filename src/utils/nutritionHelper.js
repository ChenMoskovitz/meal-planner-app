import { supabase } from '../config/supabaseClient.js';

/**
 * 1. PANTRY LOGIC
 * Formats raw API data from Edamam into "per 1 unit" values.
 */
export const formatIngredientNutrition = (apiData) => {
    if (!apiData) return null;
    return {
        calories: apiData.ENERC_KCAL / 100,
        protein: apiData.PROCNT / 100,
        fat: apiData.FAT / 100,
        fiber: apiData.FIBTG / 100
    };
};

/**
 * 2. RECIPE/MEAL/PLAN LOGIC
 * Calculates the total nutrition for a specific recipe by summing its ingredients.
 */
export async function getRecipeNutrition(recipeId) {
    if (!recipeId) return null;

    const { data, error } = await supabase
        .from('recipe_ingredients')
        .select(`
            amount,
            ingredients (
                calories_per_unit,
                protein_per_unit,
                fat_per_unit,
                fiber_per_unit
            )
        `)
        .eq('recipe_id', recipeId);

    if (error || !data) {
        console.error("Error fetching recipe nutrition:", error);
        return null;
    }

    return data.reduce((acc, item) => {
        const ing = item.ingredients;
        return {
            calories: acc.calories + (item.amount * (ing.calories_per_unit || 0)),
            protein: acc.protein + (item.amount * (ing.protein_per_unit || 0)),
            fat: acc.fat + (item.amount * (ing.fat_per_unit || 0)),
            fiber: acc.fiber + (item.amount * (ing.fiber_per_unit || 0))
        };
    }, { calories: 0, protein: 0, fat: 0, fiber: 0 });
}

/**
 * Calculates the total nutrition for multiple recipes combined.
 * Useful for summing up a whole day (Main + Side + Veggie).
 */
export async function getMultiRecipeNutrition(recipeIds) {
    // Filter out any null or undefined IDs
    const validIds = recipeIds.filter(id => id != null);
    if (validIds.length === 0) return { calories: 0, protein: 0, fat: 0, fiber: 0 };

    const totals = { calories: 0, protein: 0, fat: 0, fiber: 0 };

    // Loop through each ID and add its nutrition to the total
    for (const id of validIds) {
        const recipeNutri = await getRecipeNutrition(id);
        if (recipeNutri) {
            totals.calories += recipeNutri.calories;
            totals.protein += recipeNutri.protein;
            totals.fat += recipeNutri.fat;
            totals.fiber += recipeNutri.fiber;
        }
    }

    return totals;
}