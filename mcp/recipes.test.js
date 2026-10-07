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
import { listRecipes, formatRecipeList, RECIPE_TYPES } from './recipes.js';
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

describe('RECIPE_TYPES', () => {
    test('matches the types the app writes', () => {
        // These feed the tool's enum, so drifting from the app's RECIPE_TYPES in
        // Recipes.jsx would make the model offer a filter that matches nothing.
        assert.deepEqual(RECIPE_TYPES, ['full_meal', 'main_dish', 'side', 'vegetable_side']);
    });
});
