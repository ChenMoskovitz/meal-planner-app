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

/** A fetch that answers with one canned response, every time. */
const fetchReturning = (body, { ok = true, status = 200 } = {}) =>
    fetchSequence([{ body, ok, status }], { repeatLast: true });

/**
 * A fetch that walks a list of responses, one per call.
 *
 * Needed to test retries: "fails once then succeeds" cannot be expressed with a
 * single canned answer. An entry of the form {throws: '...'} rejects instead.
 */
const fetchSequence = (responses, { repeatLast = false } = {}) => {
    const calls = [];
    const impl = async (url) => {
        const spec = responses[calls.length] ?? (repeatLast ? responses.at(-1) : undefined);
        calls.push(url);

        if (!spec) throw new Error('fetchSequence ran out of responses');
        if (spec.throws) throw new Error(spec.throws);

        return {
            ok: spec.ok ?? true,
            status: spec.status ?? 200,
            json: async () => {
                if (spec.body === 'not json') throw new SyntaxError('Unexpected token');
                return spec.body;
            }
        };
    };
    impl.calls = calls;
    return impl;
};

/** Records how long the code asked to wait, without actually waiting. */
const recordingSleep = () => {
    const waits = [];
    const sleep = async (ms) => { waits.push(ms); };
    sleep.waits = waits;
    return sleep;
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
            env: ENV,
            sleep: recordingSleep()
        });

        assert.equal(result.found, false);
        assert.match(result.reason, /401/);
    });

    test('returns zeros when the network call throws', async () => {
        const failing = async () => {
            throw new Error('getaddrinfo ENOTFOUND');
        };

        const result = await lookupNutrition('onion', { fetchImpl: failing, env: ENV, sleep: recordingSleep() });

        assert.equal(result.found, false);
        assert.match(result.reason, /could not reach Edamam/);
    });

    test('returns zeros when the body is not JSON', async () => {
        const result = await lookupNutrition('onion', {
            fetchImpl: fetchReturning('not json'),
            env: ENV,
            sleep: recordingSleep()
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

    test('retries a 429 and uses the answer when it succeeds', async () => {
        // The bug this fixes: a rate-limited lookup stored zeros, so half a
        // recipe silently reported no calories.
        const fetchImpl = fetchSequence([
            { ok: false, status: 429 },
            { body: ONION }
        ]);
        const sleep = recordingSleep();

        const result = await lookupNutrition('onion', { fetchImpl, env: ENV, sleep });

        assert.equal(result.found, true);
        assert.equal(result.calories_per_unit, 40);
        assert.equal(fetchImpl.calls.length, 2);
        assert.deepEqual(sleep.waits, [2000], 'should have waited once before retrying');
    });

    test('gives up after the allowed number of attempts', async () => {
        const fetchImpl = fetchSequence([{ ok: false, status: 429 }], { repeatLast: true });
        const sleep = recordingSleep();

        const result = await lookupNutrition('onion', {
            fetchImpl, env: ENV, sleep, attempts: 3, backoffMs: 1000
        });

        assert.equal(result.found, false);
        assert.equal(fetchImpl.calls.length, 3);
        // Doubling each time, and no wait after the final attempt.
        assert.deepEqual(sleep.waits, [1000, 2000]);
    });

    test('marks a rate-limited failure as retriable', async () => {
        // This is what lets the tool say "run the backfill" instead of
        // "Edamam does not know this ingredient".
        const result = await lookupNutrition('onion', {
            fetchImpl: fetchReturning({}, { ok: false, status: 429 }),
            env: ENV,
            sleep: recordingSleep()
        });

        assert.equal(result.retriable, true);
        assert.match(result.reason, /rate-limiting/);
    });

    test('does not retry a food Edamam has answered about', async () => {
        // An empty result is an answer, not a failure; asking again wastes a
        // request from a very small budget.
        const fetchImpl = fetchSequence([{ body: { hints: [] } }], { repeatLast: true });

        const result = await lookupNutrition('zbgqx', {
            fetchImpl, env: ENV, sleep: recordingSleep()
        });

        assert.equal(result.found, false);
        assert.equal(result.retriable, false, 'a backfill would not help');
        assert.equal(fetchImpl.calls.length, 1, 'should not have retried');
    });

    test('retries a 5xx but not a 4xx that is not a rate limit', async () => {
        const server = fetchSequence([{ ok: false, status: 503 }, { body: ONION }]);
        const found = await lookupNutrition('onion', {
            fetchImpl: server, env: ENV, sleep: recordingSleep()
        });
        assert.equal(found.found, true, '503 should be retried');

        const rejected = fetchSequence([{ ok: false, status: 401 }], { repeatLast: true });
        const result = await lookupNutrition('onion', {
            fetchImpl: rejected, env: ENV, sleep: recordingSleep()
        });

        assert.equal(result.retriable, false, 'bad credentials will not fix themselves');
        assert.equal(rejected.calls.length, 1);
    });

    test('retries a dropped connection', async () => {
        const fetchImpl = fetchSequence([{ throws: 'ECONNRESET' }, { body: ONION }]);

        const result = await lookupNutrition('onion', {
            fetchImpl, env: ENV, sleep: recordingSleep()
        });

        assert.equal(result.found, true);
        assert.equal(fetchImpl.calls.length, 2);
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
