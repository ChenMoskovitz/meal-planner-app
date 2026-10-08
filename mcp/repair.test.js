/**
 * Tests for the nutrition repair.
 *
 * The lookup is always injected: left to the real one these would depend on
 * Edamam credentials and a network, and would make live API calls from CI.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { repairNutrition, findIngredientsWithoutNutrition, describeOutcome } from './repair.js';
import { fakeSupabase } from './fake-supabase.js';

const EMPTY = (name) => ({
    id: name,
    name,
    calories_per_unit: 0,
    protein_per_unit: 0,
    fat_per_unit: 0,
    fiber_per_unit: 0
});

const FILLED = (name) => ({
    id: name,
    name,
    calories_per_unit: 40,
    protein_per_unit: 1.1,
    fat_per_unit: 0.1,
    fiber_per_unit: 1.7
});

/** A lookup whose answer depends on the ingredient name. */
const lookupBy = (answers, fallback) => {
    const calls = [];
    const lookup = async (name) => {
        calls.push(name);
        return answers[name] ?? fallback ?? {
            calories_per_unit: 40, protein_per_unit: 1.1, fat_per_unit: 0.1, fiber_per_unit: 1.7,
            found: true, retriable: false, kind: 'found', label: name
        };
    };
    lookup.calls = calls;
    return lookup;
};

const UNAVAILABLE = {
    calories_per_unit: 0, protein_per_unit: 0, fat_per_unit: 0, fiber_per_unit: 0,
    found: false, retriable: true, kind: 'unavailable', reason: 'Edamam was rate-limiting the request'
};

const UNKNOWN = {
    calories_per_unit: 0, protein_per_unit: 0, fat_per_unit: 0, fiber_per_unit: 0,
    found: false, retriable: false, kind: 'absent', reason: 'Edamam has no entry for "zbgqx"'
};

const noSleep = async () => {};

describe('findIngredientsWithoutNutrition', () => {
    test('finds rows where every nutrient is zero', async () => {
        const db = fakeSupabase({ ingredients: [EMPTY('onion'), FILLED('carrot')] });

        const found = await findIngredientsWithoutNutrition(db);

        assert.deepEqual(found.map(i => i.name), ['onion']);
    });

    test('leaves a row alone when any nutrient is set', async () => {
        // Oil has no fibre and no protein, but its calories prove the lookup
        // already happened. Re-checking it would waste a scarce request.
        const oil = { ...EMPTY('oil'), calories_per_unit: 884, fat_per_unit: 100 };
        const db = fakeSupabase({ ingredients: [oil] });

        assert.deepEqual(await findIngredientsWithoutNutrition(db), []);
    });

    test('throws with a readable message when the pantry cannot be read', async () => {
        const db = fakeSupabase({ error: { message: 'JWT expired' } });

        await assert.rejects(() => findIngredientsWithoutNutrition(db), /Could not read the pantry/);
    });
});

describe('repairNutrition', () => {
    test('writes the values it found', async () => {
        const db = fakeSupabase({ ingredients: [EMPTY('onion')] });

        const summary = await repairNutrition(db, { lookup: lookupBy({}), sleep: noSleep });

        assert.equal(summary.filled, 1);
        assert.equal(db.tables.ingredients[0].calories_per_unit, 40);
    });

    test('stops at the limit and reports what is left', async () => {
        // This is what keeps a tool call short: do a few, say how many remain,
        // and let the model decide to call again.
        const db = fakeSupabase({
            ingredients: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(EMPTY)
        });

        const summary = await repairNutrition(db, { limit: 5, lookup: lookupBy({}), sleep: noSleep });

        assert.equal(summary.filled, 5);
        assert.equal(summary.total, 7);
        assert.equal(summary.remaining, 2);
    });

    test('repairs the rest on a second call', async () => {
        const db = fakeSupabase({ ingredients: ['a', 'b', 'c'].map(EMPTY) });

        await repairNutrition(db, { limit: 2, lookup: lookupBy({}), sleep: noSleep });
        const second = await repairNutrition(db, { limit: 2, lookup: lookupBy({}), sleep: noSleep });

        assert.equal(second.total, 1, 'only the unrepaired one should be left');
        assert.equal(second.remaining, 0);
    });

    test('counts an ingredient Edamam does not know as still remaining', async () => {
        // It keeps its zeros, so a later run will find it again. Reporting it as
        // done would make the numbers lie.
        const db = fakeSupabase({ ingredients: [EMPTY('zbgqx')] });

        const summary = await repairNutrition(db, {
            lookup: lookupBy({ zbgqx: UNKNOWN }),
            sleep: noSleep
        });

        assert.equal(summary.filled, 0);
        assert.equal(summary.unknown, 1);
        assert.equal(summary.remaining, 1);
    });

    test('separates a rate limit from an unknown food', async () => {
        const db = fakeSupabase({ ingredients: [EMPTY('onion'), EMPTY('zbgqx')] });

        const summary = await repairNutrition(db, {
            lookup: lookupBy({ onion: UNAVAILABLE, zbgqx: UNKNOWN }),
            sleep: noSleep
        });

        assert.equal(summary.unavailable, 1, 'the rate-limited one is worth retrying');
        assert.equal(summary.unknown, 1, 'the unknown one is not');
    });

    test('does not describe a missing API key as a missing food', async () => {
        // Found by a protocol test: with no credentials the reply read
        // "not in Edamam — no Edamam credentials are configured", which blames
        // the ingredient for a configuration problem.
        const db = fakeSupabase({ ingredients: [EMPTY('onion')] });
        const misconfigured = {
            calories_per_unit: 0, protein_per_unit: 0, fat_per_unit: 0, fiber_per_unit: 0,
            found: false, retriable: false, kind: 'misconfigured',
            reason: 'no Edamam credentials are configured'
        };

        const summary = await repairNutrition(db, {
            lookup: lookupBy({ onion: misconfigured }),
            sleep: noSleep
        });

        assert.equal(summary.misconfigured, 1);
        assert.equal(summary.unknown, 0, 'it is not a food Edamam lacks');

        const text = describeOutcome(summary.results[0]);
        assert.doesNotMatch(text, /not in Edamam/);
        assert.match(text, /credentials/);
    });

    test('keeps going after one ingredient fails', async () => {
        const db = fakeSupabase({ ingredients: [EMPTY('onion'), EMPTY('carrot')] });

        const summary = await repairNutrition(db, {
            lookup: lookupBy({ onion: UNAVAILABLE }),
            sleep: noSleep
        });

        assert.equal(summary.filled, 1, 'carrot should still have been repaired');
    });

    test('writes nothing in a dry run', async () => {
        const db = fakeSupabase({ ingredients: [EMPTY('onion')] });

        const summary = await repairNutrition(db, {
            dryRun: true,
            lookup: lookupBy({}),
            sleep: noSleep
        });

        assert.equal(summary.filled, 1, 'it still reports what it would do');
        assert.equal(db.tables.ingredients[0].calories_per_unit, 0, 'but changes nothing');
    });

    test('reports a failed write as retriable rather than as success', async () => {
        const db = fakeSupabase({ ingredients: [EMPTY('onion')] });
        // Make only the update fail, after the lookup has succeeded.
        const realFrom = db.from;
        db.from = (table) => {
            const chain = realFrom(table);
            const realUpdate = chain.update;
            chain.update = (values) => {
                const updating = realUpdate(values);
                updating.then = (resolve) => resolve({ data: null, error: { message: 'permission denied' } });
                return updating;
            };
            return chain;
        };

        const summary = await repairNutrition(db, { lookup: lookupBy({}), sleep: noSleep });

        assert.equal(summary.filled, 0);
        assert.equal(summary.unavailable, 1);
    });

    test('does nothing when every ingredient already has nutrition', async () => {
        const db = fakeSupabase({ ingredients: [FILLED('carrot')] });
        const lookup = lookupBy({});

        const summary = await repairNutrition(db, { lookup, sleep: noSleep });

        assert.equal(summary.total, 0);
        assert.equal(lookup.calls.length, 0, 'no requests should be spent');
    });

    test('pauses between ingredients but not after the last', async () => {
        const db = fakeSupabase({ ingredients: [EMPTY('a'), EMPTY('b'), EMPTY('c')] });
        const waits = [];

        await repairNutrition(db, {
            lookup: lookupBy({}),
            gapMs: 250,
            sleep: async (ms) => { waits.push(ms); }
        });

        assert.deepEqual(waits, [250, 250], 'two gaps between three ingredients');
    });
});

describe('describeOutcome', () => {
    test('shows the figures and what Edamam matched', () => {
        const text = describeOutcome({
            name: 'onion',
            status: 'filled',
            label: 'Onion',
            nutrition: { calories_per_unit: 40, protein_per_unit: 1.1, fat_per_unit: 0.1, fiber_per_unit: 1.7 }
        });

        assert.match(text, /kcal=40/);
        assert.match(text, /matched "Onion"/);
    });

    test('distinguishes an unknown food from an unreachable API', () => {
        const unknown = describeOutcome({ name: 'zbgqx', status: 'absent', reason: 'no entry' });
        const unavailable = describeOutcome({ name: 'onion', status: 'unavailable', reason: 'rate limit' });

        assert.match(unknown, /not in Edamam/);
        assert.match(unavailable, /could not be looked up/);
    });
});
