/**
 * MCP server for the meal planner.
 *
 * This is a plain Node program, not part of the Vite app. An MCP client — Claude
 * Desktop, Claude Code — starts it as a child process and talks to it over
 * stdin/stdout using JSON-RPC. Nothing listens on a port.
 *
 * Because stdout IS the protocol channel, console.log() here would corrupt every
 * message. Anything you want to print for yourself goes to stderr
 * (console.error), which the client shows in its logs and ignores otherwise.
 *
 * Step 1 deliberately has one tool that touches nothing: the point is to see the
 * client reach this file and run this code. Supabase comes next.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
    name: 'meal-planner',
    version: '0.1.0'
});

// A tool is a function the model may choose to call. The description is not a
// comment — it is the only thing the model reads when deciding whether this tool
// is the right one, so it is part of the interface.
server.registerTool(
    'ping',
    {
        title: 'Ping the meal planner',
        description:
            'Check that the meal planner MCP server is running. Returns a confirmation message. Use this to verify the connection works.',
        // Zod schemas become the JSON Schema the model sees. An optional field
        // here proves arguments arrive, rather than only that the call happened.
        inputSchema: {
            name: z
                .string()
                .optional()
                .describe('Optional name to greet in the reply')
        }
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

const transport = new StdioServerTransport();
await server.connect(transport);

// Confirms startup without writing to stdout, where it would break the protocol.
console.error('meal-planner MCP server ready on stdio');
