/**
 * Recipe queries.
 *
 * These take a Supabase client rather than importing one, for the same reason
 * src/utils/shoppingList.js holds no Supabase import: a function that builds its
 * own client can only be tested against a real database, and the CI job for this
 * package has no credentials. Passing the client in lets the tests supply a fake.
 */

import { findRecipe } from './ingredients.js';
import { sumIngredientNutrition, perServing } from './recipe-nutrition.js';

/** The values the recipes.type column actually holds, from RECIPE_TYPES in Recipes.jsx. */
export const RECIPE_TYPES = ['full_meal', 'main_dish', 'side', 'vegetable_side'];

export async function listRecipes(client, { type } = {}) {
    let query = client
        .from('recipes')
        .select('id, name, type, base_servings')
        .order('name');

    if (type) query = query.eq('type', type);

    const { data, error } = await query;

    // Supabase reports failures on `error` instead of throwing, so an unchecked
    // call returns undefined rows and looks like an empty database.
    if (error) throw new Error(`Could not read recipes: ${error.message}`);

    return data ?? [];
}

/**
 * Creates a recipe.
 *
 * Checks for a same-named recipe first, case-insensitively — the same check
 * findRecipe in ingredients.js relies on to give a single answer. Recipes.jsx
 * has no such guard and happily creates duplicates from the UI; a model acting
 * on its own is more likely to repeat itself (retrying after a slow response,
 * or two tool calls from one turn), so this stops it before it does.
 *
 * base_servings is left unset when not given, matching what Recipes.jsx does
 * on create — it is filled in later, through update, not invented here.
 */
export async function createRecipe(client, { name, type, baseServings }) {
    const trimmedName = name.trim();

    if (!trimmedName) {
        return { ok: false, reason: 'A recipe needs a name.' };
    }

    const { data: existing, error: lookupError } = await client
        .from('recipes')
        .select('id')
        .ilike('name', trimmedName)
        .limit(1);

    if (lookupError) throw new Error(`Could not check for an existing recipe: ${lookupError.message}`);

    if (existing?.length) {
        return {
            ok: false,
            reason: `"${trimmedName}" already exists. Use add_ingredient to add to it instead of creating it again.`
        };
    }

    const { data: inserted, error: insertError } = await client
        .from('recipes')
        .insert([{ name: trimmedName, type: type ?? null, base_servings: baseServings ?? null }])
        .select('id, name, type, base_servings');

    if (insertError) throw new Error(`Could not create "${trimmedName}": ${insertError.message}`);

    return { ok: true, recipe: inserted[0] };
}

/**
 * Updates a recipe's name, type and/or base_servings.
 *
 * Only the fields given are touched — add_recipe can only set these at
 * creation, so this is the only way to change them afterward. type is passed
 * as '' to clear it back to untyped, the same convention
 * setRecipeDescription uses for clearing the description.
 */
export async function updateRecipe(client, { recipe: recipeName, name, type, baseServings }) {
    if (name === undefined && type === undefined && baseServings === undefined) {
        return { ok: false, reason: 'Give at least one of name, type or base_servings to change.' };
    }

    const found = await findRecipe(client, recipeName);

    if (!found.ok) return { ok: false, reason: found.reason };

    const { recipe: existing } = found;
    const updates = {};

    if (name !== undefined) {
        const trimmedName = name.trim();

        if (!trimmedName) {
            return { ok: false, reason: 'A recipe needs a name.' };
        }

        const { data: matches, error: lookupError } = await client
            .from('recipes')
            .select('id')
            .ilike('name', trimmedName);

        if (lookupError) throw new Error(`Could not check for a name clash: ${lookupError.message}`);

        if ((matches ?? []).some(match => match.id !== existing.id)) {
            return { ok: false, reason: `"${trimmedName}" already exists. Pick a different name.` };
        }

        updates.name = trimmedName;
    }

    if (type !== undefined) updates.type = type === '' ? null : type;
    if (baseServings !== undefined) updates.base_servings = baseServings;

    const { error } = await client.from('recipes').update(updates).eq('id', existing.id);

    if (error) throw new Error(`Could not update "${existing.name}": ${error.message}`);

    return { ok: true, recipe: { ...existing, ...updates } };
}

/**
 * Sets a recipe's description, replacing whatever it holds — the same
 * column Recipes.jsx labels "Cooking Instructions". An empty string clears
 * it rather than being rejected, since that is how the web app's textarea
 * already behaves.
 */
export async function setRecipeDescription(client, { recipe: recipeName, description }) {
    const found = await findRecipe(client, recipeName);

    if (!found.ok) return { ok: false, message: found.reason };

    const trimmed = description.trim();
    const { recipe } = found;

    const { error } = await client
        .from('recipes')
        .update({ description: trimmed })
        .eq('id', recipe.id);

    if (error) throw new Error(`Could not save the description for "${recipe.name}": ${error.message}`);

    return {
        ok: true,
        message: trimmed
            ? `Set the description for "${recipe.name}".`
            : `Cleared the description for "${recipe.name}".`
    };
}

/**
 * Renders recipes as text for a tool result.
 *
 * The model reads this, so it is written to be read: the serving count is spelled
 * out rather than left as a bare number, and a missing one says so instead of
 * silently reading as 1 — that distinction matters because the shopping list
 * scales by base_servings.
 */
export function formatRecipeList(recipes, { type } = {}) {
    const scope = type ? `${type.replace(/_/g, ' ')} recipes` : 'recipes';

    if (recipes.length === 0) {
        return `No ${scope} found.`;
    }

    const lines = recipes.map(recipe => {
        const kind = recipe.type ? recipe.type.replace(/_/g, ' ') : 'untyped';
        const servings = recipe.base_servings
            ? `serves ${recipe.base_servings}`
            : 'no serving count set';

        return `- ${recipe.name} (${kind}, ${servings}) [id: ${recipe.id}]`;
    });

    return `${recipes.length} ${scope}:\n${lines.join('\n')}`;
}

/**
 * Reads back everything about one recipe: its own fields, its ingredients and
 * its nutrition per serving. This is what a model needs to reason about a
 * request like "plan two dinners with chicken" or "average 50g protein a
 * day" — list_recipes alone has no ingredients or nutrition to check that
 * against.
 */
export async function getRecipeDetails(client, recipeName) {
    const found = await findRecipe(client, recipeName);

    if (!found.ok) return { ok: false, reason: found.reason };

    const { recipe } = found;

    const { data: rows, error } = await client
        .from('recipe_ingredients')
        .select(`
            amount,
            ingredients:ingredient_id (name, unit_type, calories_per_unit, protein_per_unit, fat_per_unit, fiber_per_unit)
        `)
        .eq('recipe_id', recipe.id);

    if (error) throw new Error(`Could not read "${recipe.name}"'s ingredients: ${error.message}`);

    const ingredientRows = rows ?? [];

    const ingredients = ingredientRows
        .filter(row => row.ingredients)
        .map(row => ({ name: row.ingredients.name, amount: row.amount, unit: row.ingredients.unit_type }))
        .sort((a, b) => a.name.localeCompare(b.name));

    return {
        ok: true,
        recipe: {
            name: recipe.name,
            type: recipe.type,
            base_servings: recipe.base_servings,
            description: recipe.description,
            image_url: recipe.image_url,
            ingredients,
            nutrition_per_serving: perServing(sumIngredientNutrition(ingredientRows), recipe.base_servings)
        }
    };
}

/**
 * Renders one recipe's details as text for a tool result.
 */
export function formatRecipeDetails(recipe) {
    const { name, type, base_servings, description, image_url, ingredients, nutrition_per_serving } = recipe;
    const kind = type ? type.replace(/_/g, ' ') : 'untyped';
    const servings = base_servings ? `serves ${base_servings}` : 'no serving count set';

    const lines = [`${name} — ${kind}, ${servings}`];

    if (description) lines.push('', description);

    lines.push('', ingredients.length ? 'Ingredients:' : 'No ingredients yet — use add_ingredient to add some.');

    for (const ingredient of ingredients) {
        lines.push(`- ${ingredient.name}: ${ingredient.amount}${ingredient.unit}`);
    }

    // Dividing zero ingredients across servings is still zero, not a real answer.
    if (ingredients.length) {
        const n = nutrition_per_serving;
        lines.push(
            '',
            `Nutrition per serving: ${n.calories.toFixed(0)} kcal, ${n.protein.toFixed(1)}g protein, `
            + `${n.fat.toFixed(1)}g fat, ${n.fiber.toFixed(1)}g fiber`
        );
    }

    if (image_url) lines.push('', `Photo: ${image_url}`);

    return lines.join('\n');
}
