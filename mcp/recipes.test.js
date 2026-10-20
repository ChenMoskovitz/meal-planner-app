/**
 * Unit tests for the recipe queries and their rendering.
 *
 * These call the functions directly with a fake client. The protocol-level tests
 * in server.test.js cover the same tools through JSON-RPC; both exist because
 * they fail for different reasons — a wrong query fails here, an unregistered
 * tool or a bad schema fails there.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    listRecipes, formatRecipeList, createRecipe, updateRecipe, setRecipeDescription,
    getRecipeDetails, formatRecipeDetails, RECIPE_TYPES
} from './recipes.js';
import { fakeSupabase } from './fake-supabase.js';

const RECIPES = [
    { id: 'r2', name: 'Chicken soup', type: 'main_dish', base_servings: 4 },
    { id: 'r1', name: 'Almond salad', type: 'side', base_servings: 2 },
    { id: 'r3', name: 'Roast carrots', type: 'vegetable_side', base_servings: null }
];

describe('listRecipes', () => {
    test('returns every recipe, ordered by name', async () => {
        const client = fakeSupabase({ recipes: RECIPES });

        const result = await listRecipes(client);

        assert.deepEqual(
            result.map(r => r.name),
            ['Almond salad', 'Chicken soup', 'Roast carrots']
        );
    });

    test('asks the database to sort rather than sorting afterwards', async () => {
        const client = fakeSupabase({ recipes: RECIPES });

        await listRecipes(client);

        assert.equal(client.calls[0].table, 'recipes');
        assert.equal(client.calls[0].order, 'name');
    });

    test('filters by type when one is given', async () => {
        const client = fakeSupabase({ recipes: RECIPES });

        const result = await listRecipes(client, { type: 'side' });

        assert.deepEqual(result.map(r => r.name), ['Almond salad']);
        assert.equal(client.calls[0].where.type, 'side');
    });

    test('does not filter when type is undefined', async () => {
        const client = fakeSupabase({ recipes: RECIPES });

        await listRecipes(client, { type: undefined });

        assert.deepEqual(client.calls[0].where, {});
    });

    test('throws when Supabase reports an error', async () => {
        // Supabase puts failures on `error` instead of throwing, so an unchecked
        // call would look like an empty database.
        const client = fakeSupabase({ error: { message: 'JWT expired' } });

        await assert.rejects(() => listRecipes(client), /JWT expired/);
    });

    test('returns an empty array when the account has no recipes', async () => {
        const client = fakeSupabase({ recipes: [] });

        assert.deepEqual(await listRecipes(client), []);
    });
});

describe('formatRecipeList', () => {
    test('names each recipe with its type, servings and id', async () => {
        const text = formatRecipeList([RECIPES[0]]);

        assert.match(text, /Chicken soup/);
        assert.match(text, /main dish/);
        assert.match(text, /serves 4/);
        assert.match(text, /id: r2/);
    });

    test('says a serving count is missing rather than implying one', () => {
        // base_servings is nullable, and the shopping list scales by it, so
        // "no serving count set" and "serves 1" are different facts.
        const text = formatRecipeList([RECIPES[2]]);

        assert.match(text, /no serving count set/);
        assert.doesNotMatch(text, /serves 1/);
    });

    test('reports the count so the model can tell a short list from a truncated one', () => {
        assert.match(formatRecipeList(RECIPES), /^3 recipes:/);
    });

    test('names the filter in the empty case', () => {
        const text = formatRecipeList([], { type: 'vegetable_side' });

        assert.match(text, /No vegetable side recipes found/);
    });

    test('has a plain empty message when nothing was filtered', () => {
        assert.equal(formatRecipeList([]), 'No recipes found.');
    });
});

describe('createRecipe', () => {
    test('creates a recipe with the given name', async () => {
        const client = fakeSupabase({ recipes: [] });

        const result = await createRecipe(client, { name: 'Lentil stew' });

        assert.equal(result.ok, true);
        assert.equal(result.recipe.name, 'Lentil stew');
        assert.equal(client.tables.recipes.length, 1);
    });

    test('trims the name before saving it', async () => {
        const client = fakeSupabase({ recipes: [] });

        const result = await createRecipe(client, { name: '  Lentil stew  ' });

        assert.equal(result.recipe.name, 'Lentil stew');
    });

    test('rejects a name that is only whitespace', async () => {
        const client = fakeSupabase({ recipes: [] });

        const result = await createRecipe(client, { name: '   ' });

        assert.equal(result.ok, false);
        assert.match(result.reason, /needs a name/);
        assert.equal(client.tables.recipes.length, 0);
    });

    test('leaves type and base_servings unset when not given', async () => {
        const client = fakeSupabase({ recipes: [] });

        const result = await createRecipe(client, { name: 'Lentil stew' });

        assert.equal(result.recipe.type, null);
        assert.equal(result.recipe.base_servings, null);
    });

    test('saves the type and base_servings when given', async () => {
        const client = fakeSupabase({ recipes: [] });

        const result = await createRecipe(client, {
            name: 'Lentil stew',
            type: 'main_dish',
            baseServings: 4
        });

        assert.equal(result.recipe.type, 'main_dish');
        assert.equal(result.recipe.base_servings, 4);
    });

    test('refuses to create a recipe that already exists, case-insensitively', async () => {
        const client = fakeSupabase({ recipes: [{ id: 'r1', name: 'Lentil Stew' }] });

        const result = await createRecipe(client, { name: 'lentil stew' });

        assert.equal(result.ok, false);
        assert.match(result.reason, /already exists/);
        assert.equal(client.tables.recipes.length, 1);
    });

    test('throws when the existence check fails', async () => {
        const client = fakeSupabase({ error: { message: 'JWT expired' } });

        await assert.rejects(() => createRecipe(client, { name: 'Lentil stew' }), /JWT expired/);
    });
});

describe('updateRecipe', () => {
    const recipe = () => ({ id: 'r1', name: 'Lentil stew', type: 'main_dish', base_servings: 4 });

    test('renames a recipe', async () => {
        const client = fakeSupabase({ recipes: [recipe()] });

        const result = await updateRecipe(client, { recipe: 'Lentil stew', name: 'Lentil Soup' });

        assert.equal(result.ok, true);
        assert.equal(client.tables.recipes[0].name, 'Lentil Soup');
    });

    test('trims the new name before saving it', async () => {
        const client = fakeSupabase({ recipes: [recipe()] });

        await updateRecipe(client, { recipe: 'Lentil stew', name: '  Lentil Soup  ' });

        assert.equal(client.tables.recipes[0].name, 'Lentil Soup');
    });

    test('changes the type', async () => {
        const client = fakeSupabase({ recipes: [recipe()] });

        const result = await updateRecipe(client, { recipe: 'Lentil stew', type: 'side' });

        assert.equal(result.ok, true);
        assert.equal(client.tables.recipes[0].type, 'side');
        // Untouched fields stay as they were.
        assert.equal(client.tables.recipes[0].base_servings, 4);
    });

    test('clears the type when given an empty string', async () => {
        const client = fakeSupabase({ recipes: [recipe()] });

        const result = await updateRecipe(client, { recipe: 'Lentil stew', type: '' });

        assert.equal(result.ok, true);
        assert.equal(client.tables.recipes[0].type, null);
    });

    test('changes base_servings', async () => {
        const client = fakeSupabase({ recipes: [recipe()] });

        await updateRecipe(client, { recipe: 'Lentil stew', baseServings: 6 });

        assert.equal(client.tables.recipes[0].base_servings, 6);
    });

    test('rejects an empty name', async () => {
        const client = fakeSupabase({ recipes: [recipe()] });

        const result = await updateRecipe(client, { recipe: 'Lentil stew', name: '   ' });

        assert.equal(result.ok, false);
        assert.match(result.reason, /needs a name/);
    });

    test('refuses to rename onto another recipe\'s name, case-insensitively', async () => {
        const client = fakeSupabase({
            recipes: [recipe(), { id: 'r2', name: 'Lentil Soup', type: null, base_servings: null }]
        });

        const result = await updateRecipe(client, { recipe: 'Lentil stew', name: 'lentil soup' });

        assert.equal(result.ok, false);
        assert.match(result.reason, /already exists/);
        assert.equal(client.tables.recipes[0].name, 'Lentil stew');
    });

    test('allows renaming to the same name in different casing', async () => {
        const client = fakeSupabase({ recipes: [recipe()] });

        const result = await updateRecipe(client, { recipe: 'Lentil stew', name: 'LENTIL STEW' });

        assert.equal(result.ok, true);
        assert.equal(client.tables.recipes[0].name, 'LENTIL STEW');
    });

    test('says which tool to use when the recipe does not exist', async () => {
        const client = fakeSupabase({ recipes: [] });

        const result = await updateRecipe(client, { recipe: 'Beef wellington', name: 'Beef Wellington' });

        assert.equal(result.ok, false);
        assert.match(result.reason, /list_recipes/);
    });

    test('rejects a call with nothing to change', async () => {
        const client = fakeSupabase({ recipes: [recipe()] });

        const result = await updateRecipe(client, { recipe: 'Lentil stew' });

        assert.equal(result.ok, false);
        assert.match(result.reason, /at least one/);
    });

    test('throws when the update fails', async () => {
        const client = fakeSupabase({ recipes: [recipe()], error: { message: 'JWT expired' } });

        await assert.rejects(
            () => updateRecipe(client, { recipe: 'Lentil stew', type: 'side' }),
            /JWT expired/
        );
    });
});

describe('setRecipeDescription', () => {
    const recipe = () => ({ id: 'r1', name: 'Lentil stew', description: null });

    test('sets the description for a recipe', async () => {
        const client = fakeSupabase({ recipes: [recipe()] });

        const result = await setRecipeDescription(client, {
            recipe: 'Lentil stew',
            description: 'Simmer for 30 minutes.'
        });

        assert.equal(result.ok, true);
        assert.match(result.message, /Set the description for "Lentil stew"/);
        assert.equal(client.tables.recipes[0].description, 'Simmer for 30 minutes.');
    });

    test('trims the description before saving it', async () => {
        const client = fakeSupabase({ recipes: [recipe()] });

        await setRecipeDescription(client, { recipe: 'Lentil stew', description: '  Simmer.  ' });

        assert.equal(client.tables.recipes[0].description, 'Simmer.');
    });

    test('clears the description when given an empty string', async () => {
        const client = fakeSupabase({ recipes: [{ ...recipe(), description: 'Old steps.' }] });

        const result = await setRecipeDescription(client, { recipe: 'Lentil stew', description: '   ' });

        assert.equal(result.ok, true);
        assert.match(result.message, /Cleared the description for "Lentil stew"/);
        assert.equal(client.tables.recipes[0].description, '');
    });

    test('says which tool to use when the recipe does not exist', async () => {
        const client = fakeSupabase({ recipes: [] });

        const result = await setRecipeDescription(client, { recipe: 'Beef wellington', description: 'Roast it.' });

        assert.equal(result.ok, false);
        assert.match(result.message, /list_recipes/);
    });

    test('refuses to guess which recipe when two share a name', async () => {
        const client = fakeSupabase({
            recipes: [recipe(), { id: 'r2', name: 'Lentil stew', description: null }]
        });

        const result = await setRecipeDescription(client, { recipe: 'Lentil stew', description: 'Roast it.' });

        assert.equal(result.ok, false);
        assert.match(result.message, /More than one recipe/);
    });
});

describe('getRecipeDetails', () => {
    const recipe = () => ({
        id: 'soup', name: 'Chicken soup', type: 'main_dish', base_servings: 4, description: 'Simmer it.',
        image_url: 'https://x.supabase.co/recipe-images/soup.jpg'
    });

    test('reads back a recipe\'s own fields', async () => {
        const client = fakeSupabase({ recipes: [recipe()] });

        const result = await getRecipeDetails(client, 'Chicken soup');

        assert.equal(result.ok, true);
        assert.equal(result.recipe.name, 'Chicken soup');
        assert.equal(result.recipe.type, 'main_dish');
        assert.equal(result.recipe.base_servings, 4);
        assert.equal(result.recipe.description, 'Simmer it.');
        assert.equal(result.recipe.image_url, 'https://x.supabase.co/recipe-images/soup.jpg');
    });

    test('lists the ingredients, sorted by name', async () => {
        const client = fakeSupabase({
            recipes: [recipe()],
            recipe_ingredients: [
                { recipe_id: 'soup', amount: 400, ingredients: { name: 'Onion', unit_type: 'g' } },
                { recipe_id: 'soup', amount: 1000, ingredients: { name: 'Chicken breast', unit_type: 'g' } }
            ]
        });

        const result = await getRecipeDetails(client, 'Chicken soup');

        assert.deepEqual(result.recipe.ingredients, [
            { name: 'Chicken breast', amount: 1000, unit: 'g' },
            { name: 'Onion', amount: 400, unit: 'g' }
        ]);
    });

    test('skips a row whose ingredient join came back empty', async () => {
        const client = fakeSupabase({
            recipes: [recipe()],
            recipe_ingredients: [{ recipe_id: 'soup', amount: 100, ingredients: null }]
        });

        const result = await getRecipeDetails(client, 'Chicken soup');

        assert.deepEqual(result.recipe.ingredients, []);
    });

    test('computes nutrition per serving', async () => {
        const client = fakeSupabase({
            recipes: [recipe()],
            recipe_ingredients: [{
                recipe_id: 'soup',
                amount: 400,
                ingredients: {
                    name: 'Chicken breast', unit_type: 'g',
                    calories_per_unit: 165, protein_per_unit: 31, fat_per_unit: 3.6, fiber_per_unit: 0
                }
            }]
        });

        const result = await getRecipeDetails(client, 'Chicken soup');

        // 400g at per-100g figures, divided across 4 servings.
        assert.equal(result.recipe.nutrition_per_serving.calories, 165);
        assert.equal(result.recipe.nutrition_per_serving.protein, 31);
    });

    test('says which tool to use when the recipe does not exist', async () => {
        const client = fakeSupabase({ recipes: [] });

        const result = await getRecipeDetails(client, 'Beef wellington');

        assert.equal(result.ok, false);
        assert.match(result.reason, /list_recipes/);
    });

    test('throws when the ingredients query fails', async () => {
        const client = fakeSupabase({ recipes: [recipe()], error: { message: 'JWT expired' } });

        await assert.rejects(() => getRecipeDetails(client, 'Chicken soup'), /JWT expired/);
    });
});

describe('formatRecipeDetails', () => {
    test('names the recipe, its type and servings', () => {
        const text = formatRecipeDetails({
            name: 'Chicken soup', type: 'main_dish', base_servings: 4, description: '', image_url: null,
            ingredients: [], nutrition_per_serving: { calories: 0, protein: 0, fat: 0, fiber: 0 }
        });

        assert.match(text, /Chicken soup — main dish, serves 4/);
    });

    test('says a serving count is missing rather than implying one', () => {
        const text = formatRecipeDetails({
            name: 'Chicken soup', type: 'main_dish', base_servings: null, description: '', image_url: null,
            ingredients: [], nutrition_per_serving: { calories: 0, protein: 0, fat: 0, fiber: 0 }
        });

        assert.match(text, /no serving count set/);
    });

    test('includes the description when there is one', () => {
        const text = formatRecipeDetails({
            name: 'Chicken soup', type: 'main_dish', base_servings: 4, description: 'Simmer for 30 minutes.',
            image_url: null, ingredients: [], nutrition_per_serving: { calories: 0, protein: 0, fat: 0, fiber: 0 }
        });

        assert.match(text, /Simmer for 30 minutes\./);
    });

    test('points at add_ingredient when there are no ingredients yet', () => {
        const text = formatRecipeDetails({
            name: 'Chicken soup', type: 'main_dish', base_servings: 4, description: '', image_url: null,
            ingredients: [], nutrition_per_serving: { calories: 0, protein: 0, fat: 0, fiber: 0 }
        });

        assert.match(text, /add_ingredient/);
        assert.doesNotMatch(text, /Nutrition per serving/);
    });

    test('lists each ingredient with its amount and unit', () => {
        const text = formatRecipeDetails({
            name: 'Chicken soup', type: 'main_dish', base_servings: 4, description: '', image_url: null,
            ingredients: [{ name: 'Onion', amount: 100, unit: 'g' }],
            nutrition_per_serving: { calories: 0, protein: 0, fat: 0, fiber: 0 }
        });

        assert.match(text, /- Onion: 100g/);
    });

    test('shows nutrition per serving when there are ingredients', () => {
        const text = formatRecipeDetails({
            name: 'Chicken soup', type: 'main_dish', base_servings: 4, description: '', image_url: null,
            ingredients: [{ name: 'Onion', amount: 100, unit: 'g' }],
            nutrition_per_serving: { calories: 165.4, protein: 31.2, fat: 3.6, fiber: 0.5 }
        });

        assert.match(text, /165 kcal, 31\.2g protein, 3\.6g fat, 0\.5g fiber/);
    });

    test('includes the photo URL when there is one', () => {
        const text = formatRecipeDetails({
            name: 'Chicken soup', type: 'main_dish', base_servings: 4, description: '',
            image_url: 'https://x.supabase.co/recipe-images/soup.jpg',
            ingredients: [], nutrition_per_serving: { calories: 0, protein: 0, fat: 0, fiber: 0 }
        });

        assert.match(text, /Photo: https:\/\/x\.supabase\.co\/recipe-images\/soup\.jpg/);
    });
});

describe('RECIPE_TYPES', () => {
    test('matches the types the app writes', () => {
        // These feed the tool's enum, so drifting from the app's RECIPE_TYPES in
        // Recipes.jsx would make the model offer a filter that matches nothing.
        assert.deepEqual(RECIPE_TYPES, ['full_meal', 'main_dish', 'side', 'vegetable_side']);
    });
});
