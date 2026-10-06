/**
 * Protocol tests for the MCP server.
 *
 * Two layers, because they fail for different reasons:
 *
 * - "the real executable" spawns server.js as a child process over stdio,
 *   exactly as a client does. This is the only test that proves the entry point
 *   starts, that stdout carries clean JSON-RPC, and that the tools are
 *   registered on the thing the client config actually points at.
 * - "with a fake database" builds the server in-process over an in-memory
 *   transport and injects a fake Supabase client, so tool behaviour can be
 *   tested without credentials. CI has no secrets, so this is the only way
 *   list_recipes can be covered there at all.
 *
 * Both use the SDK's own Client rather than hand-written JSON-RPC: it performs
 * the handshake and matches responses to requests, so a bug in the test harness
 * cannot masquerade as a bug in the server.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from './create-server.js';
import { fakeSupabase } from './fake-supabase.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const RECIPES = [
    { id: 'r2', name: 'Chicken soup', type: 'main_dish', base_servings: 4 },
    { id: 'r1', name: 'Almond salad', type: 'side', base_servings: 2 }
];

/** Connects a client to an in-process server backed by `client` as its database. */
async function connectWithDatabase(database) {
    const server = createServer({ getClient: async () => database });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    const mcp = new Client({ name: 'server.test.js', version: '1.0.0' });
    await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);

    return mcp;
}

describe('the real executable', () => {
    let mcp;

    before(async () => {
        // No credentials are passed. The server signs in lazily, so it must
        // start and serve ping and tools/list without them — which is also what
        // makes this suite runnable in CI.
        const transport = new StdioClientTransport({
            command: process.execPath,
            args: [path.join(HERE, 'server.js')]
        });

        mcp = new Client({ name: 'server.test.js', version: '1.0.0' });
        await mcp.connect(transport);
    });

    after(async () => {
        await mcp?.close();
    });

    test('reports its name through the handshake', () => {
        assert.equal(mcp.getServerVersion().name, 'meal-planner');
    });

    test('advertises both tools', async () => {
        const { tools } = await mcp.listTools();
        const names = tools.map(tool => tool.name).sort();

        assert.deepEqual(names, ['list_recipes', 'ping']);
    });

    test('describes every tool well enough for a model to choose it', async () => {
        const { tools } = await mcp.listTools();

        for (const tool of tools) {
            // The description is the only thing the model reads when deciding
            // whether a tool fits, so an empty one is a broken interface.
            assert.ok(
                tool.description && tool.description.length > 30,
                `${tool.name} needs a real description`
            );
        }
    });

    test('offers the recipe type filter as an enum of the real column values', async () => {
        const { tools } = await mcp.listTools();
        const listRecipes = tools.find(tool => tool.name === 'list_recipes');

        assert.deepEqual(listRecipes.inputSchema.properties.type.enum, [
            'full_meal',
            'main_dish',
            'side',
            'vegetable_side'
        ]);
        assert.ok(
            !listRecipes.inputSchema.required?.includes('type'),
            'the filter is optional and must not be required'
        );
    });

    test('marks the read-only tools as read-only', async () => {
        const { tools } = await mcp.listTools();

        // Clients use these hints to decide how much to interrupt the user. A
        // write tool added later without updating them would be auto-approved.
        for (const tool of tools) {
            assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name}`);
        }
    });

    test('answers ping over real stdio', async () => {
        const result = await mcp.callTool({ name: 'ping', arguments: { name: 'Chen' } });

        assert.notEqual(result.isError, true);
        assert.match(result.content[0].text, /Hello, Chen/);
    });

    test('reports missing credentials as a readable tool error', async () => {
        // Blanking the variable rather than relying on an absent .env: loadEnv
        // resolves the file from the module's own directory, so the project's
        // real .env is found no matter where the test runs from. An empty value
        // already set in the environment wins over the file, which is the
        // behaviour that lets a client or CI override it.
        const transport = new StdioClientTransport({
            command: process.execPath,
            args: [path.join(HERE, 'server.js')],
            env: { ...getDefaultEnvironment(), VITE_SUPABASE_URL: '' }
        });

        const unconfigured = new Client({ name: 'server.test.js', version: '1.0.0' });
        await unconfigured.connect(transport);

        try {
            // The server must still start and serve the handshake — a
            // credentials problem is a tool-level failure, not a dead server.
            assert.equal(unconfigured.getServerVersion().name, 'meal-planner');

            const result = await unconfigured.callTool({ name: 'list_recipes', arguments: {} });

            assert.equal(result.isError, true);
            assert.match(result.content[0].text, /VITE_SUPABASE_URL/);
        } finally {
            await unconfigured.close();
        }
    });

    test('still answers a tool that needs no credentials', async () => {
        const result = await mcp.callTool({ name: 'ping', arguments: {} });

        assert.notEqual(result.isError, true);
    });
});

describe('with a fake database', () => {
    test('lists the recipes it is given', async () => {
        const mcp = await connectWithDatabase(fakeSupabase({ recipes: RECIPES }));

        const result = await mcp.callTool({ name: 'list_recipes', arguments: {} });

        assert.notEqual(result.isError, true);
        assert.match(result.content[0].text, /Chicken soup/);
        assert.match(result.content[0].text, /Almond salad/);
        await mcp.close();
    });

    test('passes the type filter through to the query', async () => {
        const database = fakeSupabase({ recipes: RECIPES });
        const mcp = await connectWithDatabase(database);

        const result = await mcp.callTool({
            name: 'list_recipes',
            arguments: { type: 'side' }
        });

        assert.match(result.content[0].text, /Almond salad/);
        assert.doesNotMatch(result.content[0].text, /Chicken soup/);
        assert.equal(database.calls[0].filters.type, 'side');
        await mcp.close();
    });

    test('rejects a type the column cannot hold', async () => {
        const mcp = await connectWithDatabase(fakeSupabase({ recipes: RECIPES }));

        // The enum is enforced before the handler runs, so a bad filter never
        // reaches the database.
        const result = await mcp.callTool({
            name: 'list_recipes',
            arguments: { type: 'dessert' }
        });

        assert.equal(result.isError, true);
        await mcp.close();
    });

    test('says so plainly when the account has no recipes', async () => {
        const mcp = await connectWithDatabase(fakeSupabase({ recipes: [] }));

        const result = await mcp.callTool({ name: 'list_recipes', arguments: {} });

        assert.notEqual(result.isError, true);
        assert.match(result.content[0].text, /No recipes found/);
        await mcp.close();
    });

    test('turns a database failure into a tool error, not a crash', async () => {
        const mcp = await connectWithDatabase(
            fakeSupabase({ error: { message: 'JWT expired' } })
        );

        const result = await mcp.callTool({ name: 'list_recipes', arguments: {} });

        assert.equal(result.isError, true);
        assert.match(result.content[0].text, /JWT expired/);
        await mcp.close();
    });
});
