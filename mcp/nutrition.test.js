/**
 * Tests for the Edamam nutrition lookup.
 *
 * No network: fetch is injected, so these run in CI where there are no Edamam
 * credentials, and they can exercise failures a real API would only produce
 * occasionally — a 401, a timeout, a food nobody has heard of.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { lookupNutrition, EMPTY_NUTRITION } from './nutrition.js';

const ENV = { VITE_EDAMAM_FOOD_ID: 'id', VITE_EDAMAM_FOOD_KEY: 'key' };

/** A fetch that answers with one canned response. */
const fetchReturning = (body, { ok = true, status = 200 } = {}) => {
    const calls = [];
    const impl = async (url) => {
        calls.push(url);
        return {
            ok,
            status,
            json: async () => {
                if (body === 'not json') throw new SyntaxError('Unexpected token');
                return body;
            }
        };
    };
    impl.calls = calls;
    return impl;
};

const ONION = {
    hints: [
        {
            food: {
                label: 'Onion',
                nutrients: { ENERC_KCAL: 40, PROCNT: 1.1, FAT: 0.1, FIBTG: 1.7, CHOCDF: 9.34 }
            }
        }
    ]
};

describe('lookupNutrition', () => {
    test('maps Edamam nutrients onto the per_unit columns', async () => {
        const result = await lookupNutrition('onion', { fetchImpl: fetchReturning(ONION), env: ENV });

        assert.equal(result.found, true);
        assert.deepEqual(
            {
                calories_per_unit: result.calories_per_unit,
                protein_per_unit: result.protein_per_unit,
                fat_per_unit: result.fat_per_unit,
                fiber_per_unit: result.fiber_per_unit
            },
            { calories_per_unit: 40, protein_per_unit: 1.1, fat_per_unit: 0.1, fiber_per_unit: 1.7 }
        );
    });

    test('keeps Edamam\'s per-100g scale rather than converting', async () => {
        // nutritionHelper.js divides by 100 when reading these columns, so
        // storing a per-gram figure here would make every recipe 100x too small.
        const result = await lookupNutrition('onion', { fetchImpl: fetchReturning(ONION), env: ENV });

        assert.equal(result.calories_per_unit, 40, 'the raw per-100g value, not 0.4');
    });

    test('sends the ingredient name and both credentials', async () => {
        const fetchImpl = fetchReturning(ONION);

        await lookupNutrition('red onion', { fetchImpl, env: ENV });

        const url = fetchImpl.calls[0];
        assert.match(url, /ingr=red\+onion/);
        assert.match(url, /app_id=id/);
        assert.match(url, /app_key=key/);
    });

    test('treats a nutrient Edamam omits as zero', async () => {
        const noFibre = {
            hints: [{ food: { label: 'Oil', nutrients: { ENERC_KCAL: 884, FAT: 100 } } }]
        };

        const result = await lookupNutrition('oil', { fetchImpl: fetchReturning(noFibre), env: ENV });

        assert.equal(result.found, true);
        assert.equal(result.fiber_per_unit, 0);
        assert.equal(result.protein_per_unit, 0);
    });

    // Every branch below has to return zeros rather than throw: a spice Edamam
    // does not know must not stop the ingredient being added to the recipe.
    test('returns zeros and a reason when Edamam knows nothing', async () => {
        const result = await lookupNutrition('zbgqx', {
            fetchImpl: fetchReturning({ hints: [] }),
            env: ENV
        });

        assert.equal(result.found, false);
        assert.match(result.reason, /no entry for "zbgqx"/);
        assert.equal(result.calories_per_unit, 0);
    });

    test('returns zeros when the credentials are rejected', async () => {
        const result = await lookupNutrition('onion', {
            fetchImpl: fetchReturning({}, { ok: false, status: 401 }),
            env: ENV
        });

        assert.equal(result.found, false);
        assert.match(result.reason, /401/);
    });

    test('returns zeros when the network call throws', async () => {
        const failing = async () => {
            throw new Error('getaddrinfo ENOTFOUND');
        };

        const result = await lookupNutrition('onion', { fetchImpl: failing, env: ENV });

        assert.equal(result.found, false);
        assert.match(result.reason, /could not reach Edamam/);
    });

    test('returns zeros when the body is not JSON', async () => {
        const result = await lookupNutrition('onion', {
            fetchImpl: fetchReturning('not json'),
            env: ENV
        });

        assert.equal(result.found, false);
        assert.match(result.reason, /not JSON/);
    });

    test('does not call Edamam at all when credentials are missing', async () => {
        // The CI job runs without them, so this is the path that runs there.
        const fetchImpl = fetchReturning(ONION);

        const result = await lookupNutrition('onion', { fetchImpl, env: {} });

        assert.equal(result.found, false);
        assert.match(result.reason, /no Edamam credentials/);
        assert.equal(fetchImpl.calls.length, 0, 'no request should be made');
    });

    test('EMPTY_NUTRITION covers exactly the four stored columns', async () => {
        assert.deepEqual(Object.keys(EMPTY_NUTRITION).sort(), [
            'calories_per_unit',
            'fat_per_unit',
            'fiber_per_unit',
            'protein_per_unit'
        ]);
    });
});
