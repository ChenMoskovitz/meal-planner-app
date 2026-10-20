/**
 * Per-recipe nutrition arithmetic.
 *
 * Mirrors sumIngredientNutrition and perServing in
 * src/utils/nutritionHelper.js — the two packages cannot share code, so keep
 * this in sync by hand if that file's arithmetic changes.
 */

/**
 * Totals the nutrition of recipe_ingredients rows.
 *
 * The *_per_unit columns hold Edamam's per-100g figures, so every amount is
 * divided by 100.
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
