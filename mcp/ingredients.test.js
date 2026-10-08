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

/**
 * A stand-in for the Edamam lookup. Always injected: left to the real one these
 * tests would depend on credentials and a network, and would quietly make live
 * API calls from CI.
 */
const lookupReturning = (nutrition) => {
    const calls = [];
    const lookup = async (name) => {
        calls.push(name);
        return nutrition;
    };
    lookup.calls = calls;
    return lookup;
};

const FOUND = {
    calories_per_unit: 40,
    protein_per_unit: 1.1,
    fat_per_unit: 0.1,
    fiber_per_unit: 1.7,
    found: true,
    label: 'Onion'
};

const NOT_FOUND = {
    calories_per_unit: 0,
    protein_per_unit: 0,
    fat_per_unit: 0,
    fiber_per_unit: 0,
    found: false,
    retriable: false,
    reason: 'Edamam has no entry for "sumac"'
};

const RATE_LIMITED = {
    calories_per_unit: 0,
    protein_per_unit: 0,
    fat_per_unit: 0,
    fiber_per_unit: 0,
    found: false,
    retriable: true,
    reason: 'Edamam was rate-limiting the request'
};

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

describe('nutrition on a new ingredient', () => {
    test('stores the figures the lookup returned', async () => {
        const db = database();

        await findOrCreateIngredient(db, { name: 'Onion', lookup: lookupReturning(FOUND) });

        const row = db.tables.ingredients[0];
        assert.equal(row.calories_per_unit, 40);
        assert.equal(row.protein_per_unit, 1.1);
        assert.equal(row.fat_per_unit, 0.1);
        assert.equal(row.fiber_per_unit, 1.7);
    });

    test('stores zeros when the lookup found nothing', async () => {
        const db = database();

        await findOrCreateIngredient(db, { name: 'sumac', lookup: lookupReturning(NOT_FOUND) });

        assert.equal(db.tables.ingredients[0].calories_per_unit, 0);
    });

    test('still adds the ingredient when the lookup throws', async () => {
        // A third-party outage must not stop the user adding an ingredient.
        const db = database();
        const exploding = async () => {
            throw new Error('network down');
        };

        const { created } = await findOrCreateIngredient(db, { name: 'Onion', lookup: exploding });

        assert.equal(created, true);
        assert.equal(db.tables.ingredients[0].calories_per_unit, 0);
    });

    test('does not look anything up for an ingredient that already exists', async () => {
        // Its figures are already stored, and re-fetching would spend quota on
        // every single add.
        const db = database({ ingredients: [{ id: 'onion', name: 'Onion', unit_type: 'g' }] });
        const lookup = lookupReturning(FOUND);

        await findOrCreateIngredient(db, { name: 'Onion', lookup });

        assert.equal(lookup.calls.length, 0);
    });

    test('says the nutrition was stored', async () => {
        const result = await addIngredient(database(), {
            recipe: 'Chicken soup',
            ingredient: 'Onion',
            amount: 200,
            lookup: lookupReturning(FOUND)
        });

        assert.match(result.message, /with its nutrition data/);
    });

    test('points at the backfill when the lookup was only rate-limited', async () => {
        // The distinction that matters: this ingredient's values can be filled
        // in later, unlike one Edamam has never heard of.
        const result = await addIngredient(database(), {
            recipe: 'Chicken soup',
            ingredient: 'kidney beans',
            amount: 330,
            lookup: lookupReturning(RATE_LIMITED)
        });

        assert.match(result.message, /could not be looked up right now/);
        assert.match(result.message, /backfill/);
        assert.doesNotMatch(result.message, /no entry/);
    });

    test('does not promise a backfill for a food Edamam does not know', async () => {
        const result = await addIngredient(database(), {
            recipe: 'Chicken soup',
            ingredient: 'sumac',
            amount: 5,
            lookup: lookupReturning(NOT_FOUND)
        });

        assert.doesNotMatch(result.message, /backfill/);
    });

    test('says why the nutrition is missing', async () => {
        // Zeros make a recipe report no calories, which the user would otherwise
        // only notice much later and have no way to explain.
        const result = await addIngredient(database(), {
            recipe: 'Chicken soup',
            ingredient: 'sumac',
            amount: 5,
            lookup: lookupReturning(NOT_FOUND)
        });

        assert.match(result.message, /nutrition values are zero/);
        assert.match(result.message, /no entry for "sumac"/);
    });
});

describe('addIngredient', () => {
    test('adds an ingredient to a recipe and says so', async () => {
        const db = database();

        const result = await addIngredient(db, {
            recipe: 'Chicken soup',
            ingredient: 'Onion',
            amount: 200,
            lookup: lookupReturning(FOUND)
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
            amount: 200,
            lookup: lookupReturning(FOUND)
        });

        assert.match(result.message, /was new, so it was added to the pantry/);
    });

    test('says nothing about the pantry when the ingredient already existed', async () => {
        const db = database({ ingredients: [{ id: 'onion', name: 'Onion', unit_type: 'g' }] });

        const result = await addIngredient(db, {
            recipe: 'Chicken soup',
            ingredient: 'Onion',
            amount: 200,
            lookup: lookupReturning(FOUND)
        });

        assert.doesNotMatch(result.message, /pantry/);
    });

    test('adds to the amount instead of creating a second row', async () => {
        // The duplicate-row bug the shopping list had, in a different table.
        const db = database();

        const lookup = lookupReturning(FOUND);
        await addIngredient(db, { recipe: 'Chicken soup', ingredient: 'Onion', amount: 200, lookup });
        const second = await addIngredient(db, {
            recipe: 'Chicken soup',
            ingredient: 'Onion',
            amount: 100,
            lookup
        });

        assert.equal(db.tables.recipe_ingredients.length, 1);
        assert.equal(db.tables.recipe_ingredients[0].amount, 300);
        assert.match(second.message, /from 200g to 300g/);
    });

    test('keeps the same ingredient in two recipes separate', async () => {
        const db = database();

        const lookup = lookupReturning(FOUND);
        await addIngredient(db, { recipe: 'Chicken soup', ingredient: 'Onion', amount: 200, lookup });
        await addIngredient(db, { recipe: 'Israeli salad', ingredient: 'Onion', amount: 50, lookup });

        assert.equal(db.tables.recipe_ingredients.length, 2);
        assert.equal(db.tables.ingredients.length, 1, 'the pantry should hold one onion');
    });

    test('fails without writing anything when the recipe does not exist', async () => {
        const db = database();

        const result = await addIngredient(db, {
            recipe: 'Beef wellington',
            ingredient: 'Onion',
            amount: 200,
            lookup: lookupReturning(FOUND)
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
            () => addIngredient(db, { recipe: 'Chicken soup', ingredient: 'Onion', amount: 200, lookup: lookupReturning(FOUND) }),
            /permission denied/
        );
    });
});
