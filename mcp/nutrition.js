/**
 * Nutrition lookup against Edamam's food database.
 *
 * This is the same endpoint the Pantry's "Info" button uses in the web app. The
 * MCP server needs it because an ingredient created without these values stores
 * zeros, and the app computes a recipe's nutrition by summing its ingredients —
 * so one unlooked-up ingredient silently reports a recipe as having no calories.
 *
 * `fetch` is injected rather than called directly so tests can supply their own:
 * CI has no Edamam credentials, and a test that depends on a third-party API is
 * flaky by construction.
 */

const ENDPOINT = 'https://api.edamam.com/api/food-database/v2/parser';

/**
 * The *_per_unit columns hold Edamam's raw per-100g figures, not per-gram.
 * nutritionHelper.js divides by 100 when reading them, so anything stored here
 * has to be on that same scale or every recipe's numbers are off by 100x.
 */
export const EMPTY_NUTRITION = {
    calories_per_unit: 0,
    protein_per_unit: 0,
    fat_per_unit: 0,
    fiber_per_unit: 0
};

/**
 * Looks up one ingredient.
 *
 * Never throws and never rejects the caller's work: a missing spice or a
 * throttled API should not stop an ingredient being added, so every failure
 * returns zeros along with a reason the tool can pass on to the user.
 */
export async function lookupNutrition(name, { fetchImpl = fetch, env = process.env } = {}) {
    const appId = env.VITE_EDAMAM_FOOD_ID;
    const appKey = env.VITE_EDAMAM_FOOD_KEY;

    if (!appId || !appKey) {
        return { ...EMPTY_NUTRITION, found: false, reason: 'no Edamam credentials are configured' };
    }

    const url = `${ENDPOINT}?${new URLSearchParams({ app_id: appId, app_key: appKey, ingr: name })}`;

    let response;
    try {
        response = await fetchImpl(url);
    } catch (error) {
        return { ...EMPTY_NUTRITION, found: false, reason: `could not reach Edamam (${error.message})` };
    }

    // A rejected key or an exhausted quota still arrives as a valid HTTP
    // response, so the status has to be checked before trusting the body.
    if (!response.ok) {
        return { ...EMPTY_NUTRITION, found: false, reason: `Edamam responded ${response.status}` };
    }

    let data;
    try {
        data = await response.json();
    } catch {
        return { ...EMPTY_NUTRITION, found: false, reason: 'Edamam sent a response that was not JSON' };
    }

    const food = data?.hints?.[0]?.food;
    const nutrients = food?.nutrients;

    if (!nutrients) {
        return { ...EMPTY_NUTRITION, found: false, reason: `Edamam has no entry for "${name}"` };
    }

    return {
        // `|| 0` rather than `??`: Edamam omits a nutrient it has no figure for,
        // and some entries carry a null instead of leaving the key out.
        calories_per_unit: nutrients.ENERC_KCAL || 0,
        protein_per_unit: nutrients.PROCNT || 0,
        fat_per_unit: nutrients.FAT || 0,
        fiber_per_unit: nutrients.FIBTG || 0,
        found: true,
        label: food.label ?? name
    };
}
