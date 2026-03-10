import { supabase } from '../config/supabaseClient';

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
 * 2. SINGLE RECIPE LOGIC
 * Calculates nutrition per single portion.
 */
export async function getRecipeNutrition(recipeId) {
    if (!recipeId) return null;

    const { data: recipeData, error: recipeError } = await supabase
        .from('recipes')
        .select('base_servings')
        .eq('id', recipeId)
        .single();

    const { data: ingredientsData, error: ingError } = await supabase
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

    if (recipeError || ingError || !ingredientsData) {
        console.error("Error fetching recipe nutrition:", recipeError || ingError);
        return null;
    }

    const totalNutrition = ingredientsData.reduce((acc, item) => {
        const ing = item.ingredients;
        return {
            calories: acc.calories + (item.amount * (ing.calories_per_unit || 0)),
            protein: acc.protein + (item.amount * (ing.protein_per_unit || 0)),
            fat: acc.fat + (item.amount * (ing.fat_per_unit || 0)),
            fiber: acc.fiber + (item.amount * (ing.fiber_per_unit || 0))
        };
    }, { calories: 0, protein: 0, fat: 0, fiber: 0 });

    const servings = recipeData?.base_servings || 1;

    return {
        calories: totalNutrition.calories / servings,
        protein: totalNutrition.protein / servings,
        fat: totalNutrition.fat / servings,
        fiber: totalNutrition.fiber / servings
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