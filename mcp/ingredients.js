/**
 * Adding an ingredient to a recipe.
 *
 * Mirrors what Recipes.jsx does when you add an ingredient through the web app:
 * an ingredient already in the recipe has its amount increased rather than
 * getting a second row — the same duplicate-row problem the shopping list had.
 *
 * Takes a Supabase client as an argument so the tests can pass a fake.
 */

import { lookupNutrition, EMPTY_NUTRITION } from './nutrition.js';

export const UNITS = ['g', 'ml'];

/**
 * Finds one recipe by name.
 *
 * Case-insensitive, because a model repeating a name back from list_recipes may
 * not match the stored capitalisation. Returns a reason rather than throwing
 * when there is no single answer, so the tool can say something useful.
 */
export async function findRecipe(client, name) {
    const { data, error } = await client
        .from('recipes')
        .select('id, name')
        .ilike('name', name);

    if (error) throw new Error(`Could not look up the recipe: ${error.message}`);

    const matches = data ?? [];

    if (matches.length === 0) {
        return { ok: false, reason: `No recipe called "${name}". Use list_recipes to see what exists.` };
    }

    // Two recipes with the same name is a real possibility — nothing stops it —
    // and silently picking the first would put the ingredient in the wrong one.
    if (matches.length > 1) {
        return {
            ok: false,
            reason: `More than one recipe is called "${name}". Rename one of them first.`
        };
    }

    return { ok: true, recipe: matches[0] };
}

/**
 * Finds an ingredient by name, creating it if it does not exist yet.
 *
 * Deliberately a lookup followed by an insert rather than the upsert Pantry.jsx
 * uses: the unique constraint backing that upsert is on the name column, so a
 * conflict with another user's row would be rejected by row-level security
 * instead of resolving. A lookup only ever sees this account's own rows.
 */
export async function findOrCreateIngredient(client, { name, unit = 'g', lookup = lookupNutrition }) {
    const { data: existing, error: lookupError } = await client
        .from('ingredients')
        .select('id, name, unit_type')
        .ilike('name', name)
        .limit(1);

    if (lookupError) throw new Error(`Could not look up the ingredient: ${lookupError.message}`);

    if (existing?.length) return { ingredient: existing[0], created: false };

    // Nutrition is fetched only for a brand-new ingredient. The *_per_unit
    // columns are what the whole nutrition feature reads, and an ingredient
    // stored with zeros makes every recipe containing it report no calories at
    // all — silently, because zero is a valid number.
    const { found, reason, label, ...nutrition } = await lookup(name).catch(() => ({
        ...EMPTY_NUTRITION,
        found: false,
        reason: 'the nutrition lookup failed'
    }));

    const { data: inserted, error: insertError } = await client
        .from('ingredients')
        .insert([{ name, unit_type: unit, stock_quantity: 0, ...nutrition }])
        .select('id, name, unit_type');

    if (insertError) throw new Error(`Could not add "${name}" to the pantry: ${insertError.message}`);

    return { ingredient: inserted[0], created: true, nutritionFound: found, nutritionReason: reason };
}

/**
 * Puts an ingredient in a recipe, or increases the amount if it is already there.
 *
 * Returns what happened so the caller can say "added" or "increased" rather than
 * reporting both as a bare success.
 */
export async function addIngredientToRecipe(client, { recipeId, ingredientId, amount }) {
    const { data: existing, error: lookupError } = await client
        .from('recipe_ingredients')
        .select('amount')
        .eq('recipe_id', recipeId)
        .eq('ingredient_id', ingredientId)
        .limit(1);

    // Treating a failed lookup as "not here yet" would insert a duplicate row.
    if (lookupError) {
        throw new Error(`Could not check the recipe's ingredients: ${lookupError.message}`);
    }

    const existingRow = existing?.[0];

    if (existingRow) {
        // Captured before the update: reading it afterwards risks reporting the
        // new value as the old one if the row object is live rather than a copy.
        const previousAmount = Number(existingRow.amount);
        const total = previousAmount + Number(amount);

        const { error } = await client
            .from('recipe_ingredients')
            .update({ amount: total })
            .eq('recipe_id', recipeId)
            .eq('ingredient_id', ingredientId);

        if (error) throw new Error(`Could not update the amount: ${error.message}`);

        return { increased: true, previousAmount, amount: total };
    }

    const { error } = await client
        .from('recipe_ingredients')
        .insert([{ recipe_id: recipeId, ingredient_id: ingredientId, amount }]);

    if (error) throw new Error(`Could not add the ingredient to the recipe: ${error.message}`);

    return { increased: false, amount: Number(amount) };
}

/**
 * The whole operation, as one call.
 *
 * Reports the pantry ingredient being new, because that is a side effect the
 * user did not ask for and should hear about.
 */
export async function addIngredient(
    client,
    { recipe: recipeName, ingredient: ingredientName, amount, unit, lookup = lookupNutrition }
) {
    const found = await findRecipe(client, recipeName);

    if (!found.ok) return { ok: false, message: found.reason };

    const { ingredient, created, nutritionFound, nutritionReason } = await findOrCreateIngredient(
        client,
        { name: ingredientName, unit, lookup }
    );

    const result = await addIngredientToRecipe(client, {
        recipeId: found.recipe.id,
        ingredientId: ingredient.id,
        amount
    });

    const unitLabel = ingredient.unit_type ?? '';

    // A new pantry ingredient is a side effect the user did not ask for, and a
    // missing nutrition figure is worth saying out loud rather than leaving them
    // to wonder later why a recipe reports no calories.
    const note = created
        ? nutritionFound
            ? ` "${ingredient.name}" was new, so it was added to the pantry with its nutrition data.`
            : ` "${ingredient.name}" was new, so it was added to the pantry — but ${nutritionReason}, so its nutrition values are zero.`
        : '';

    const message = result.increased
        ? `${found.recipe.name} already had ${ingredient.name}, so the amount went from ${result.previousAmount}${unitLabel} to ${result.amount}${unitLabel}.${note}`
        : `Added ${result.amount}${unitLabel} ${ingredient.name} to ${found.recipe.name}.${note}`;

    return { ok: true, message };
}
