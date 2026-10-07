/**
 * Unit tests for adding an ingredient to a recipe.
 *
 * The fake client holds real rows, so a write made by one call is visible to the
 * next — which is what lets these tests check that adding the same ingredient
 * twice merges instead of duplicating, the way the database would.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addIngredient, findRecipe, findOrCreateIngredient } from './ingredients.js';
import { fakeSupabase } from './fake-supabase.js';

const RECIPES = [
    { id: 'soup', name: 'Chicken soup', type: 'main_dish', base_servings: 4 },
    { id: 'salad', name: 'Israeli salad', type: 'vegetable_side', base_servings: 2 }
];

const database = (extra = {}) =>
    fakeSupabase({ recipes: structuredClone(RECIPES), ingredients: [], recipe_ingredients: [], ...extra });

describe('findRecipe', () => {
    test('finds a recipe by its exact name', async () => {
        const result = await findRecipe(database(), 'Chicken soup');

        assert.equal(result.ok, true);
        assert.equal(result.recipe.id, 'soup');
    });

    test('ignores capitalisation', async () => {
        // A model repeating a name back may not match the stored casing.
        const result = await findRecipe(database(), 'chicken SOUP');

        assert.equal(result.ok, true);
        assert.equal(result.recipe.id, 'soup');
    });

    test('says which tool to use when the recipe does not exist', async () => {
        const result = await findRecipe(database(), 'Beef wellington');

        assert.equal(result.ok, false);
        assert.match(result.reason, /list_recipes/);
    });

    test('refuses to guess when two recipes share a name', async () => {
        // Nothing stops duplicate names, and picking the first would silently put
        // the ingredient in the wrong recipe.
        const db = database({
            recipes: [
                { id: 'a', name: 'Soup' },
                { id: 'b', name: 'soup' }
            ]
        });

        const result = await findRecipe(db, 'Soup');

        assert.equal(result.ok, false);
        assert.match(result.reason, /More than one/);
    });
});

describe('findOrCreateIngredient', () => {
    test('creates an ingredient that does not exist yet', async () => {
        const db = database();

        const { ingredient, created } = await findOrCreateIngredient(db, { name: 'Onion' });

        assert.equal(created, true);
        assert.equal(ingredient.name, 'Onion');
        assert.equal(db.tables.ingredients.length, 1);
    });

    test('defaults a new ingredient to grams', async () => {
        const db = database();

        const { ingredient } = await findOrCreateIngredient(db, { name: 'Onion' });

        assert.equal(ingredient.unit_type, 'g');
    });

    test('honours the unit when one is given', async () => {
        const db = database();

        const { ingredient } = await findOrCreateIngredient(db, { name: 'Olive oil', unit: 'ml' });

        assert.equal(ingredient.unit_type, 'ml');
    });

    test('reuses an existing ingredient instead of creating a second', async () => {
        const db = database({
            ingredients: [{ id: 'onion', name: 'Onion', unit_type: 'g' }]
        });

        const { ingredient, created } = await findOrCreateIngredient(db, { name: 'onion' });

        assert.equal(created, false);
        assert.equal(ingredient.id, 'onion');
        assert.equal(db.tables.ingredients.length, 1);
    });

    test('keeps the existing unit rather than the requested one', async () => {
        // Changing the unit of an ingredient already used by other recipes would
        // silently rescale every one of them.
        const db = database({
            ingredients: [{ id: 'onion', name: 'Onion', unit_type: 'g' }]
        });

        const { ingredient } = await findOrCreateIngredient(db, { name: 'Onion', unit: 'ml' });

        assert.equal(ingredient.unit_type, 'g');
    });
});

describe('addIngredient', () => {
    test('adds an ingredient to a recipe and says so', async () => {
        const db = database();

        const result = await addIngredient(db, {
            recipe: 'Chicken soup',
            ingredient: 'Onion',
            amount: 200
        });

        assert.equal(result.ok, true);
        assert.match(result.message, /Added 200g Onion to Chicken soup/);
        assert.equal(db.tables.recipe_ingredients.length, 1);
        assert.equal(db.tables.recipe_ingredients[0].amount, 200);
    });

    test('mentions that a new pantry ingredient was created', async () => {
        // A side effect the user did not ask for should be reported.
        const db = database();

        const result = await addIngredient(db, {
            recipe: 'Chicken soup',
            ingredient: 'Onion',
            amount: 200
        });

        assert.match(result.message, /was new, so it was added to the pantry/);
    });

    test('says nothing about the pantry when the ingredient already existed', async () => {
        const db = database({ ingredients: [{ id: 'onion', name: 'Onion', unit_type: 'g' }] });

        const result = await addIngredient(db, {
            recipe: 'Chicken soup',
            ingredient: 'Onion',
            amount: 200
        });

        assert.doesNotMatch(result.message, /pantry/);
    });

    test('adds to the amount instead of creating a second row', async () => {
        // The duplicate-row bug the shopping list had, in a different table.
        const db = database();

        await addIngredient(db, { recipe: 'Chicken soup', ingredient: 'Onion', amount: 200 });
        const second = await addIngredient(db, {
            recipe: 'Chicken soup',
            ingredient: 'Onion',
            amount: 100
        });

        assert.equal(db.tables.recipe_ingredients.length, 1);
        assert.equal(db.tables.recipe_ingredients[0].amount, 300);
        assert.match(second.message, /from 200g to 300g/);
    });

    test('keeps the same ingredient in two recipes separate', async () => {
        const db = database();

        await addIngredient(db, { recipe: 'Chicken soup', ingredient: 'Onion', amount: 200 });
        await addIngredient(db, { recipe: 'Israeli salad', ingredient: 'Onion', amount: 50 });

        assert.equal(db.tables.recipe_ingredients.length, 2);
        assert.equal(db.tables.ingredients.length, 1, 'the pantry should hold one onion');
    });

    test('fails without writing anything when the recipe does not exist', async () => {
        const db = database();

        const result = await addIngredient(db, {
            recipe: 'Beef wellington',
            ingredient: 'Onion',
            amount: 200
        });

        assert.equal(result.ok, false);
        // The recipe is checked first on purpose: creating a pantry ingredient
        // for a recipe that does not exist would leave litter behind.
        assert.equal(db.tables.ingredients.length, 0);
        assert.equal(db.tables.recipe_ingredients.length, 0);
    });

    test('propagates a database failure rather than reporting success', async () => {
        const db = database({ error: { message: 'permission denied' } });

        await assert.rejects(
            () => addIngredient(db, { recipe: 'Chicken soup', ingredient: 'Onion', amount: 200 }),
            /permission denied/
        );
    });
});
