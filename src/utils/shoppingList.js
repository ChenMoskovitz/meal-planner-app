/**
 * Shopping list arithmetic.
 *
 * The app's model is that you cook a recipe in whole batches: a recipe that
 * serves 4 is cooked as 4 servings even when only 2 are planned, and the rest
 * shows as leftovers on the day card. So the question the shopping list has to
 * answer is not "how many portions do I need" but "how many times do I cook
 * this recipe", which is where the ceiling comes from.
 *
 * No Supabase import here on purpose: these are pure functions so the unit job,
 * which runs without secrets, can exercise them.
 */

/**
 * How many whole recipes to cook to cover `plannedServings` portions.
 *
 * base_servings is nullable in the database and older recipes have no value,
 * so a missing count falls back to a 1-serving recipe, matching the `|| 1`
 * the day card already uses.
 */
export function batchesFor(plannedServings, baseServings) {
    const base = baseServings || 1;
    const planned = plannedServings || 1;

    return Math.max(1, Math.ceil(planned / base));
}

/**
 * Totals ingredients across every planned slot in the week.
 *
 * `occurrences` is one entry per planned slot, not per recipe: the same recipe
 * on Monday and Thursday is cooked twice and has to be bought for twice. Rows
 * are the recipe_ingredients records for all the recipes involved, fetched in
 * one query and grouped here by recipe_id.
 */
export function sumWeeklyIngredients(occurrences, rows) {
    const rowsByRecipe = new Map();

    for (const row of rows) {
        if (!row.ingredients) continue;
        if (!rowsByRecipe.has(row.recipe_id)) rowsByRecipe.set(row.recipe_id, []);
        rowsByRecipe.get(row.recipe_id).push(row);
    }

    const totals = {};

    for (const { recipeId, batches } of occurrences) {
        for (const row of rowsByRecipe.get(recipeId) || []) {
            const name = row.ingredients.name;
            if (!totals[name]) {
                totals[name] = { amount: 0, unit: row.ingredients.unit_type || '' };
            }
            totals[name].amount += (row.amount || 0) * batches;
        }
    }

    return totals;
}

/**
 * Amounts are multiplied, so decimal ingredients turn into long binary
 * fractions. Two decimals is enough for a grocery list.
 */
export function roundAmount(amount) {
    return Math.round(amount * 100) / 100;
}
