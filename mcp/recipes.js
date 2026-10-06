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
