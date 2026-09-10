import { supabase } from '../config/supabaseClient';

/**
 * 1. DISPLAY HELPER
 * Converts Edamam's per-100g figures into "per 1 unit" values for display.
 *
 * NOTE: this is not the storage scale. The ingredients.*_per_unit columns
 * hold Edamam's raw per-100g values, and getRecipeNutrition below divides
 * by 100 when reading them. Do not persist the output of this function.
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
 * 2. SINGLE RECIPE LOGIC
 * Calculates nutrition per single portion.
 */
export async function getRecipeNutrition(recipeId) {
    if (!recipeId) return null;

    const { data: recipeData } = await supabase
        .from('recipes')
        .select('base_servings')
        .eq('id', recipeId)
        .single();

    const { data: ingredientsData } = await supabase
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

    if (!ingredientsData) return null;

    return perServing(
        sumIngredientNutrition(ingredientsData),
        recipeData?.base_servings
    );
}

/**
 * Totals the nutrition of recipe_ingredients rows.
 *
 * The *_per_unit columns hold Edamam's per-100g figures, so every amount is
 * divided by 100. Split out from getRecipeNutrition so the arithmetic can be
 * tested without a database.
 */
export function sumIngredientNutrition(rows) {
    return rows.reduce((acc, item) => {
        const ing = item.ingredients;
        if (!ing) return acc;

        const amount = item.amount || 0;

        return {
            calories: acc.calories + (amount * (ing.calories_per_unit || 0)) / 100,
            protein: acc.protein + (amount * (ing.protein_per_unit || 0)) / 100,
            fat: acc.fat + (amount * (ing.fat_per_unit || 0)) / 100,
            fiber: acc.fiber + (amount * (ing.fiber_per_unit || 0)) / 100
        };
    }, { calories: 0, protein: 0, fat: 0, fiber: 0 });
}

/**
 * Divides a recipe's totals across its servings.
 * A missing or zero serving count falls back to 1 portion.
 */
export function perServing(totals, servings) {
    const divisor = servings || 1;

    return {
        calories: totals.calories / divisor,
        protein: totals.protein / divisor,
        fat: totals.fat / divisor,
        fiber: totals.fiber / divisor
    };
}

/**
 * 3. MULTI-RECIPE LOGIC (For MealPlan.jsx)
 * Loops through multiple IDs and sums up their per-portion nutrition.
 */
export async function getMultiRecipeNutrition(recipeIds) {
    if (!recipeIds || recipeIds.length === 0) return null;

    const results = await Promise.all(recipeIds.map(id => getRecipeNutrition(id)));

    return results.reduce((acc, curr) => {
        if (!curr) return acc;
        return {
            calories: acc.calories + curr.calories,
            protein: acc.protein + curr.protein,
            fat: acc.fat + curr.fat,
            fiber: acc.fiber + curr.fiber
        };
    }, { calories: 0, protein: 0, fat: 0, fiber: 0 });
}