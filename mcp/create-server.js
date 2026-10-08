/**
 * Builds the MCP server.
 *
 * Separate from server.js so tests can construct a server without opening a
 * stdio transport, and can pass a fake database instead of real credentials.
 * server.js stays the executable entry point, so the client config keeps
 * pointing at the same file.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { listRecipes, formatRecipeList, RECIPE_TYPES } from './recipes.js';
import { addIngredient, UNITS } from './ingredients.js';
import { repairNutrition, describeOutcome } from './repair.js';

/**
 * A tool failure has to come back as a result with isError, not a thrown
 * exception: the model can read a result and tell the user what went wrong,
 * whereas a throw becomes a protocol-level error it cannot explain.
 */
const REPAIR_BATCH = 5;

function toolError(message) {
    return { isError: true, content: [{ type: 'text', text: message }] };
}

/**
 * Runs write operations one at a time.
 *
 * add_ingredient looks an ingredient up and then inserts it if it is missing.
 * A client may run several tool calls from one turn concurrently, and two calls
 * naming the same new ingredient would both see it missing and both insert it —
 * which is exactly what happened the first time this was tried against the real
 * database, leaving "Lemon" and "lemon" side by side in the pantry.
 *
 * A queue is enough because this server is a single process per client. The
 * durable fix is a unique index on the ingredient name per user, which would
 * make the database reject the second insert outright; until that exists, this
 * stops the server from racing against itself.
 */
function createWriteQueue() {
    let tail = Promise.resolve();

    return function serialize(work) {
        // The queue advances whether the work succeeded or failed; a rejection
        // must not stop everything behind it.
        const result = tail.then(work, work);
        tail = result.then(() => {}, () => {});

        return result;
    };
}

/**
 * @param getClient - returns a signed-in Supabase client. Called per tool
 *   invocation rather than at startup so a credentials problem surfaces as a
 *   readable tool error instead of preventing the server from starting at all.
 */
export function createServer({ getClient, lookup }) {
    const server = new McpServer({ name: 'meal-planner', version: '0.4.0' });
    const serialize = createWriteQueue();

    server.registerTool(
        'ping',
        {
            title: 'Ping the meal planner',
            description:
                'Check that the meal planner MCP server is running. Returns a confirmation message. Use this to verify the connection works.',
            inputSchema: {
                name: z.string().optional().describe('Optional name to greet in the reply')
            },
            annotations: { readOnlyHint: true, openWorldHint: false }
        },
        async ({ name }) => ({
            content: [
                {
                    type: 'text',
                    text: name
                        ? `Meal planner MCP server is running. Hello, ${name}.`
                        : 'Meal planner MCP server is running.'
                }
            ]
        })
    );

    server.registerTool(
        'list_recipes',
        {
            title: 'List recipes',
            // Written for the model, not for a human reader: it says what the
            // data is, when to reach for the tool, and what comes back, because
            // this text is the only thing it has to decide on.
            description:
                "List the recipes saved in the user's meal planner. Returns each recipe's name, type and how many servings it makes. Use this before planning meals or suggesting what to cook, so suggestions come from recipes the user actually has. Optionally filter to one type of dish.",
            inputSchema: {
                // An enum rather than a string: the model is told the valid
                // values instead of guessing, and a typo fails before the query.
                type: z
                    .enum(RECIPE_TYPES)
                    .optional()
                    .describe('Only return recipes of this type. Omit to return all recipes.')
            },
            annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
        },
        async ({ type }) => {
            try {
                const client = await getClient();
                const recipes = await listRecipes(client, { type });

                return { content: [{ type: 'text', text: formatRecipeList(recipes, { type }) }] };
            } catch (error) {
                return toolError(error.message);
            }
        }
    );

    server.registerTool(
        'add_ingredient',
        {
            title: 'Add an ingredient to a recipe',
            description:
                "Add an ingredient to one of the user's recipes, with an amount. If the ingredient is not in their pantry yet it is created there first, so it can be used by any recipe. If the recipe already contains that ingredient the amounts are added together rather than listed twice. Amounts feed the per-serving nutrition and the weekly shopping list, so they should be what the recipe actually calls for.",
            inputSchema: {
                recipe: z
                    .string()
                    .min(1)
                    .describe('The exact name of the recipe, as returned by list_recipes.'),
                ingredient: z
                    .string()
                    .min(1)
                    .describe('The ingredient name, for example "onion" or "olive oil".'),
                amount: z
                    .number()
                    .positive()
                    .describe('How much the recipe uses, in the ingredient\'s unit.'),
                unit: z
                    .enum(UNITS)
                    .optional()
                    .describe(
                        'Unit for a new pantry ingredient: g for solids, ml for liquids. Defaults to g. Ignored when the ingredient already exists, since it keeps the unit it was created with.'
                    )
            },
            // The first tool here that writes. readOnlyHint false is what tells a
            // client to ask before running it rather than treating it as a lookup.
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: false,
                openWorldHint: false
            }
        },
        async ({ recipe, ingredient, amount, unit }) => {
            try {
                const result = await serialize(async () =>
                    addIngredient(await getClient(), {
                        recipe, ingredient, amount, unit, ...(lookup ? { lookup } : {})
                    })
                );

                // A recipe that does not exist is the user's problem to fix, not a
                // failure of the server, but it still has to read as "did not work".
                return result.ok
                    ? { content: [{ type: 'text', text: result.message }] }
                    : toolError(result.message);
            } catch (error) {
                return toolError(error.message);
            }
        }
    );

    server.registerTool(
        'repair_nutrition',
        {
            title: 'Fill in missing ingredient nutrition',
            description:
                "Fill in nutrition data for pantry ingredients that have none. Ingredients added while the food database was rate-limiting are stored with zeros, which makes any recipe containing them report no calories; this looks them up again and saves the values. Works through a few ingredients per call and reports how many are left, so call it again while any remain. Use it when adding ingredients reported that a lookup could not be completed.",
            inputSchema: {},
            // Writes, but only ever fills in blanks — it never changes a value
            // that is already set, and running it twice is harmless.
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: true
            }
        },
        async () => {
            try {
                const summary = await serialize(async () =>
                    repairNutrition(await getClient(), {
                        // Injected only by tests; the default is the real one.
                        ...(lookup ? { lookup } : {}),
                        // Bounded so the call returns in seconds. The reply says
                        // how many are left, which is what prompts another call.
                        limit: REPAIR_BATCH,
                        // Less patient than the CLI: someone is waiting here.
                        attempts: 3,
                        backoffMs: 1500,
                        gapMs: 500
                    })
                );

                if (summary.total === 0) {
                    return { content: [{ type: 'text', text: 'Every ingredient already has nutrition data.' }] };
                }

                const lines = summary.results.map(describeOutcome);
                const left = summary.remaining > 0
                    ? `\n\n${summary.remaining} still without nutrition — call repair_nutrition again to continue.`
                    : '\n\nEvery ingredient now has nutrition data.';

                return {
                    content: [
                        {
                            type: 'text',
                            text: `Repaired ${summary.filled} of ${summary.total}:\n${lines.join('\n')}${left}`
                        }
                    ]
                };
            } catch (error) {
                return toolError(error.message);
            }
        }
    );

    return server;
}
