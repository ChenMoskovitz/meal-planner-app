/**
 * Fills in nutrition for every pantry ingredient that has none.
 *
 *     npm run backfill            repair everything
 *     npm run backfill -- --dry   list what would change, touch nothing
 *
 * The same work the repair_nutrition tool does, without a limit and with longer
 * waits, because nobody is watching a terminal the way they watch a chat reply.
 * Safe to re-run: only rows where every nutrient is zero are touched.
 */
import { signedInClient } from './supabase.js';
import { repairNutrition, describeOutcome } from './repair.js';

const dryRun = process.argv.includes('--dry');

const { client } = await signedInClient();

const summary = await repairNutrition(client, {
    dryRun,
    // Printed as each one finishes rather than in a batch at the end: a full
    // run takes minutes, and silence looks like a hang.
    onProgress: outcome => console.log(`  ${describeOutcome(outcome)}`)
});

if (summary.total === 0) {
    console.log('Every ingredient already has nutrition.');
    process.exit(0);
}

console.log(
    `\n${summary.filled} ${dryRun ? 'would be filled' : 'filled'}, ` +
    `${summary.unknown} not in Edamam, ${summary.unavailable} still to retry.`
);

// Non-zero exit when a retry could still help, so a scripted run knows to come
// back. A food Edamam has never heard of is not a failure.
if (summary.unavailable > 0) process.exit(1);
