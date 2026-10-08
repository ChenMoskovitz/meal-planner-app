/**
 * Fills in nutrition for pantry ingredients that have none.
 *
 * The repair path for a rate-limited lookup. Edamam's free tier lets roughly
 * four requests through before a 429 and sends no Retry-After, so adding a dozen
 * ingredients in one conversation reliably leaves some with zeros. The tool
 * itself only retries twice, because a person is waiting on the reply; here
 * nobody is, so it waits properly and keeps going.
 *
 *     npm run backfill            repair everything with no nutrition
 *     npm run backfill -- --dry   list what would change, touch nothing
 *
 * Safe to run repeatedly: it only looks at rows where every nutrient is zero,
 * and anything already filled in is left alone.
 */
import { signedInClient } from './supabase.js';
import { lookupNutrition } from './nutrition.js';

// Spacing between ingredients. Measured against the free tier, four requests in
// a row trip the limit however far apart they are, so this is not a cure — the
// retries are. It just means the retries usually have less work to do.
const GAP_MS = 1500;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const dryRun = process.argv.includes('--dry');

const { client } = await signedInClient();

const { data: all, error } = await client
    .from('ingredients')
    .select('id, name, calories_per_unit, protein_per_unit, fat_per_unit, fiber_per_unit')
    .order('name');

if (error) {
    console.error(`Could not read the pantry: ${error.message}`);
    process.exit(1);
}

// Every nutrient zero, not just calories: salt legitimately has zero calories
// but real sodium-free values elsewhere, and a partially filled row means the
// lookup already succeeded.
const empty = all.filter(
    i => !i.calories_per_unit && !i.protein_per_unit && !i.fat_per_unit && !i.fiber_per_unit
);

console.log(`${all.length} ingredients in the pantry, ${empty.length} with no nutrition.`);
if (dryRun) console.log('(dry run — nothing will be written)');
if (empty.length === 0) process.exit(0);
console.log();

let filled = 0;
let unknown = 0;
let failed = 0;

for (const [index, ingredient] of empty.entries()) {
    // Patient: five attempts starting at three seconds, so a rate-limited run
    // waits out the window instead of giving up like the tool does.
    const { found, retriable, reason, label, ...nutrition } = await lookupNutrition(ingredient.name, {
        attempts: 5,
        backoffMs: 3000
    });

    if (!found) {
        const outcome = retriable ? 'could not reach Edamam' : 'not in Edamam';
        console.log(`  ${ingredient.name.padEnd(28)} skipped — ${outcome} (${reason})`);
        retriable ? failed++ : unknown++;
    } else if (dryRun) {
        console.log(`  ${ingredient.name.padEnd(28)} would set kcal=${nutrition.calories_per_unit} (matched "${label}")`);
        filled++;
    } else {
        const { error: updateError } = await client
            .from('ingredients')
            .update(nutrition)
            .eq('id', ingredient.id);

        if (updateError) {
            console.log(`  ${ingredient.name.padEnd(28)} update failed — ${updateError.message}`);
            failed++;
        } else {
            console.log(`  ${ingredient.name.padEnd(28)} kcal=${nutrition.calories_per_unit} protein=${nutrition.protein_per_unit} fat=${nutrition.fat_per_unit} fiber=${nutrition.fiber_per_unit}  (matched "${label}")`);
            filled++;
        }
    }

    if (index < empty.length - 1) await sleep(GAP_MS);
}

console.log(`\n${filled} filled, ${unknown} not in Edamam, ${failed} still to retry.`);

// A non-zero exit when work remains, so a scripted run can tell it should go
// again. Ingredients Edamam genuinely does not know are not a failure.
if (failed > 0) process.exit(1);
