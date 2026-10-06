/**
 * Step 2a: prove Supabase works from Node, with no MCP involved.
 *
 * Run it with `npm run check` inside mcp/. If this fails it is credentials or
 * row-level security, not the protocol — which is the whole reason it is a
 * separate script rather than a tool in server.js.
 *
 * The row count is the interesting output. Zero rows with no error is the
 * signature of an unauthenticated query: RLS hides everything and reports
 * success, so "it connected" and "it can see your data" are different claims.
 */
import { signedInClient } from './supabase.js';

const { client, user } = await signedInClient();

console.log(`Signed in as ${user.email}`);
console.log(`user_id      ${user.id}\n`);

const { data, error } = await client
    .from('recipes')
    .select('id, name, type, base_servings')
    .order('name');

if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
}

console.log(`recipes visible: ${data.length}`);

for (const recipe of data) {
    const servings = recipe.base_servings ? `serves ${recipe.base_servings}` : 'no serving count';
    console.log(`  ${recipe.name} — ${recipe.type ?? 'no type'}, ${servings}`);
}

if (data.length === 0) {
    console.log('\nNo recipes. Either this account has none, or RLS is hiding them.');
}
