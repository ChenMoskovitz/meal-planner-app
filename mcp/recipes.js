/**
 * Recipe queries.
 *
 * These take a Supabase client rather than importing one, for the same reason
 * src/utils/shoppingList.js holds no Supabase import: a function that builds its
 * own client can only be tested against a real database, and the CI job for this
 * package has no credentials. Passing the client in lets the tests supply a fake.
 */

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
