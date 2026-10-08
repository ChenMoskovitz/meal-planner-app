/**
 * Filling in nutrition for pantry ingredients that have none.
 *
 * Shared by two callers with different patience. `npm run backfill` repairs
 * everything with long waits, because nobody is watching. The repair_nutrition
 * tool does a handful per call and returns, because a tool call that runs for
 * minutes will time out in the client and leave the user with nothing.
 *
 * Why repair exists at all: Edamam's free tier lets roughly four requests
 * through before a 429 and sends no Retry-After, so adding a dozen ingredients
 * in one conversation reliably leaves some with zeros.
 */
import { lookupNutrition } from './nutrition.js';

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Pantry rows with no nutrition at all.
 *
 * Every nutrient must be zero, not just calories: a partially filled row means
 * the lookup already succeeded and that ingredient genuinely has no fibre.
 *
 * This does catch salt, which really is zero across the board, so salt is
 * re-checked on every run. One wasted request is cheaper than a schema change
 * to record "looked this up already".
 */
export async function findIngredientsWithoutNutrition(client) {
    const { data, error } = await client
        .from('ingredients')
        .select('id, name, calories_per_unit, protein_per_unit, fat_per_unit, fiber_per_unit')
        .order('name');

    if (error) throw new Error(`Could not read the pantry: ${error.message}`);

    return (data ?? []).filter(
        i => !i.calories_per_unit && !i.protein_per_unit && !i.fat_per_unit && !i.fiber_per_unit
    );
}

/**
 * Looks up and stores nutrition for ingredients that have none.
 *
 * @param limit stop after this many ingredients, leaving the rest for a later
 *   call. The tool uses it to stay responsive; the CLI leaves it unset.
 * @param attempts/backoffMs passed to the lookup — the CLI is more patient.
 * @param onProgress called after each ingredient, for the CLI's live output.
 * @returns per-ingredient outcomes plus `remaining`, so a caller can tell
 *   whether to come back for more.
 */
export async function repairNutrition(
    client,
    {
        limit = Infinity,
        attempts = 5,
        backoffMs = 3000,
        gapMs = 1500,
        dryRun = false,
        lookup = lookupNutrition,
        sleep = wait,
        onProgress = () => {}
    } = {}
) {
    const all = await findIngredientsWithoutNutrition(client);
    const batch = all.slice(0, limit === Infinity ? undefined : limit);

    const results = [];

    for (const [index, ingredient] of batch.entries()) {
        const { found, retriable, kind, reason, label, ...nutrition } = await lookup(ingredient.name, {
            attempts,
            backoffMs
        });

        let outcome;

        if (!found) {
            // Three different failures: a food Edamam does not have, a lookup
            // that never completed, and no API key at all. Only the middle one
            // is worth a later retry, and none of them should be described as
            // the others.
            const status = kind ?? (retriable ? 'unavailable' : 'absent');
            outcome = { name: ingredient.name, status, reason };
        } else if (dryRun) {
            outcome = { name: ingredient.name, status: 'would-fill', label, nutrition };
        } else {
            const { error } = await client
                .from('ingredients')
                .update(nutrition)
                .eq('id', ingredient.id);

            outcome = error
                ? { name: ingredient.name, status: 'unavailable', reason: error.message }
                : { name: ingredient.name, status: 'filled', label, nutrition };
        }

        results.push(outcome);
        onProgress(outcome);

        if (index < batch.length - 1) await sleep(gapMs);
    }

    const filled = results.filter(r => r.status === 'filled' || r.status === 'would-fill').length;

    return {
        results,
        filled,
        unknown: results.filter(r => r.status === 'absent').length,
        misconfigured: results.filter(r => r.status === 'misconfigured').length,
        unavailable: results.filter(r => r.status === 'unavailable').length,
        // What a later call would still find. An ingredient Edamam does not
        // know stays in the pantry with zeros, so it counts as remaining —
        // otherwise the numbers would not add up for the caller.
        remaining: all.length - filled,
        total: all.length
    };
}

/** One readable line per outcome, for both the CLI and the tool's reply. */
export function describeOutcome(outcome) {
    switch (outcome.status) {
        case 'filled':
        case 'would-fill': {
            const n = outcome.nutrition;
            const verb = outcome.status === 'filled' ? '' : 'would set ';
            return `${outcome.name}: ${verb}kcal=${n.calories_per_unit} protein=${n.protein_per_unit} fat=${n.fat_per_unit} fiber=${n.fiber_per_unit} (matched "${outcome.label}")`;
        }
        case 'absent':
            return `${outcome.name}: not in Edamam — ${outcome.reason}`;
        case 'misconfigured':
            return `${outcome.name}: ${outcome.reason}`;
        default:
            return `${outcome.name}: could not be looked up — ${outcome.reason}`;
    }
}
