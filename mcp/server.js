/**
 * MCP server entry point for the meal planner.
 *
 * A plain Node program, not part of the Vite app. An MCP client — Claude
 * Desktop, Claude Code — starts it as a child process and talks to it over
 * stdin/stdout using JSON-RPC. Nothing listens on a port.
 *
 * Because stdout IS the protocol channel, console.log() here would corrupt every
 * message. Anything printed for a human goes to stderr (console.error), which
 * the client surfaces in its logs.
 *
 * The server itself is built in create-server.js; this file only wires the real
 * database to it and opens the transport.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './create-server.js';
import { signedInClient } from './supabase.js';

/**
 * Signs in on the first tool call and reuses the session after that.
 *
 * Deferred rather than done at startup so bad credentials produce a readable
 * tool error instead of a server that dies before the client can say why. The
 * promise is cached, not the result, so two tool calls arriving together share
 * one sign-in rather than racing.
 */
let session = null;

async function getClient() {
    if (!session) {
        session = signedInClient().catch(error => {
            // Clearing the cache lets the next call retry; keeping a rejected
            // promise would make one transient failure permanent.
            session = null;
            throw error;
        });
    }

    return (await session).client;
}

const server = createServer({ getClient });

await server.connect(new StdioServerTransport());

console.error('meal-planner MCP server ready on stdio');
