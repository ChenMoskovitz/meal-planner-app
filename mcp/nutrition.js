/**
 * Nutrition lookup against Edamam's food database.
 *
 * This is the same endpoint the Pantry's "Info" button uses in the web app. The
 * MCP server needs it because an ingredient created without these values stores
 * zeros, and the app computes a recipe's nutrition by summing its ingredients —
 * so one unlooked-up ingredient silently reports a recipe as having no calories.
 *
 * The important distinction here is between two kinds of failure:
 *
 *   - Edamam has no entry for the name    -> permanent. Zeros are the answer.
 *   - 429, 5xx, network error             -> transient. Zeros are a lie.
 *
 * Both used to look identical to the caller, so a rate-limited batch quietly
 * wrote zeros for half a recipe. Transient failures are retried, and when they
 * are finally given up on they say so, so the caller can tell the user the value
 * is repairable rather than absent.
 *
 * Measured against the free tier on 2026-10-08: roughly four requests get
 * through before a 429, with no Retry-After header, and spacing calls four
 * seconds apart does not prevent it. Pacing alone cannot work; retrying can.
 *
 * `fetch` and `sleep` are injected so tests need no network and no real delays.
 */

const ENDPOINT = 'https://api.edamam.com/api/food-database/v2/parser';

/** Retried: the request never reached a verdict about the food itself. */
const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export const EMPTY_NUTRITION = {
    calories_per_unit: 0,
    protein_per_unit: 0,
    fat_per_unit: 0,
    fiber_per_unit: 0
};

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * One attempt. Returns either a result or a description of why it failed and
 * whether that failure is worth repeating.
 */
async function attempt(name, { fetchImpl, appId, appKey }) {
    const url = `${ENDPOINT}?${new URLSearchParams({ app_id: appId, app_key: appKey, ingr: name })}`;

    let response;
    try {
        response = await fetchImpl(url);
    } catch (error) {
        // A connection that never completed says nothing about the food.
        return { ok: false, transient: true, reason: `could not reach Edamam (${error.message})` };
    }

    if (!response.ok) {
        const transient = TRANSIENT_STATUSES.has(response.status);
        const reason = response.status === 429
            ? 'Edamam was rate-limiting the request'
            : `Edamam responded ${response.status}`;

        return { ok: false, transient, reason };
    }

    let data;
    try {
        data = await response.json();
    } catch {
        return { ok: false, transient: true, reason: 'Edamam sent a response that was not JSON' };
    }

    const food = data?.hints?.[0]?.food;
    const nutrients = food?.nutrients;

    // An empty result is Edamam answering the question: it has no such food.
    if (!nutrients) {
        return { ok: false, transient: false, reason: `Edamam has no entry for "${name}"` };
    }

    return {
        ok: true,
        nutrition: {
            // `|| 0` rather than `??`: Edamam omits a nutrient it has no figure
            // for, and some entries carry a null instead of leaving the key out.
            calories_per_unit: nutrients.ENERC_KCAL || 0,
            protein_per_unit: nutrients.PROCNT || 0,
            fat_per_unit: nutrients.FAT || 0,
            fiber_per_unit: nutrients.FIBTG || 0
        },
        label: food.label ?? name
    };
}

/**
 * Looks up one ingredient, retrying transient failures.
 *
 * Never throws: a lookup problem must not stop an ingredient being added to a
 * recipe. `retriable` on the result tells the caller whether a later backfill
 * could still fill the values in.
 *
 * @param attempts how many tries in total. The default of 2 keeps a tool call
 *   responsive; the backfill passes a larger number because nothing is waiting.
 * @param backoffMs the first wait, doubled each time.
 */
export async function lookupNutrition(
    name,
    {
        fetchImpl = fetch,
        env = process.env,
        attempts = 2,
        backoffMs = 2000,
        sleep = wait
    } = {}
) {
    const appId = env.VITE_EDAMAM_FOOD_ID;
    const appKey = env.VITE_EDAMAM_FOOD_KEY;

    if (!appId || !appKey) {
        return {
            ...EMPTY_NUTRITION,
            found: false,
            retriable: false,
            reason: 'no Edamam credentials are configured'
        };
    }

    let last;

    for (let tryNumber = 1; tryNumber <= attempts; tryNumber++) {
        last = await attempt(name, { fetchImpl, appId, appKey });

        if (last.ok) return { ...last.nutrition, found: true, retriable: false, label: last.label };

        // A permanent answer will not change by asking again.
        if (!last.transient) break;

        if (tryNumber < attempts) await sleep(backoffMs * 2 ** (tryNumber - 1));
    }

    return {
        ...EMPTY_NUTRITION,
        found: false,
        retriable: last.transient === true,
        reason: last.reason
    };
}
