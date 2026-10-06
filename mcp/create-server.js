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

/**
 * A tool failure has to come back as a result with isError, not a thrown
 * exception: the model can read a result and tell the user what went wrong,
 * whereas a throw becomes a protocol-level error it cannot explain.
 */
function toolError(message) {
    return { isError: true, content: [{ type: 'text', text: message }] };
}

/**
 * @param getClient - returns a signed-in Supabase client. Called per tool
 *   invocation rather than at startup so a credentials problem surfaces as a
 *   readable tool error instead of preventing the server from starting at all.
 */
export function createServer({ getClient }) {
    const server = new McpServer({ name: 'meal-planner', version: '0.2.0' });

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

    return server;
}
