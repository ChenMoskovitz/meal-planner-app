/**
 * Protocol tests for the MCP server.
 *
 * These spawn the real server as a child process and speak JSON-RPC over its
 * stdin/stdout, which is exactly what an MCP client does. Testing through the
 * protocol rather than by importing the tool functions is the point: a tool can
 * be perfectly correct and still be unusable because its schema is wrong or it
 * never got registered, and only the handshake catches that.
 *
 * Uses node:test, so there is no test dependency to install.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.js');

const PROTOCOL_VERSION = '2025-06-18';

/**
 * Starts the server, runs the handshake, and returns a `call` function.
 *
 * Responses are matched by JSON-RPC id rather than by arrival order, because
 * nothing in the protocol promises a server answers in the order it was asked.
 */
async function connect() {
    const child = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });

    const pending = new Map();
    let buffer = '';

    child.stdout.on('data', chunk => {
        buffer += chunk;

        // Messages are newline-delimited, and a chunk can split one in half or
        // carry several at once.
        let newline;
        while ((newline = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line) continue;

            const message = JSON.parse(line);
            const resolve = pending.get(message.id);
            if (resolve) {
                pending.delete(message.id);
                resolve(message);
            }
        }
    });

    let nextId = 1;

    const send = (method, params) => {
        const id = nextId++;
        const message = { jsonrpc: '2.0', id, method, params };

        return new Promise((resolve, reject) => {
            // Without this a bug in the server hangs the suite until the runner
            // gives up, with no indication of which call never came back.
            const timer = setTimeout(
                () => reject(new Error(`No response to ${method} within 5s`)),
                5000
            );
            pending.set(id, value => {
                clearTimeout(timer);
                resolve(value);
            });
            child.stdin.write(`${JSON.stringify(message)}\n`);
        });
    };

    const notify = (method) => {
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`);
    };

    const initialized = await send('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'server.test.js', version: '1.0.0' }
    });
    notify('notifications/initialized');

    return { send, initialized, close: () => child.kill() };
}

describe('meal-planner MCP server', () => {
    test('completes the initialize handshake', async () => {
        const { initialized, close } = await connect();

        try {
            assert.equal(initialized.result.serverInfo.name, 'meal-planner');
            assert.equal(initialized.result.protocolVersion, PROTOCOL_VERSION);
            // A server with no registered tools still handshakes, so the
            // capability is what tells a client there is anything to call.
            assert.ok(initialized.result.capabilities.tools);
        } finally {
            close();
        }
    });

    test('advertises ping with a described, non-required argument', async () => {
        const { send, close } = await connect();

        try {
            const { result } = await send('tools/list', {});
            const ping = result.tools.find(tool => tool.name === 'ping');

            assert.ok(ping, 'ping is not in tools/list');

            // The description is the only thing the model reads when choosing a
            // tool, so an empty one is a broken interface, not a style problem.
            assert.ok(ping.description?.length > 20, 'ping needs a real description');

            assert.equal(ping.inputSchema.properties.name.type, 'string');
            assert.ok(
                !ping.inputSchema.required?.includes('name'),
                'name is optional and must not be required'
            );
        } finally {
            close();
        }
    });

    test('answers ping without an argument', async () => {
        const { send, close } = await connect();

        try {
            const { result } = await send('tools/call', { name: 'ping', arguments: {} });

            assert.equal(result.isError, undefined);
            assert.match(result.content[0].text, /running/);
        } finally {
            close();
        }
    });

    test('passes the name argument through to the reply', async () => {
        const { send, close } = await connect();

        try {
            const { result } = await send('tools/call', {
                name: 'ping',
                arguments: { name: 'Chen' }
            });

            assert.match(result.content[0].text, /Hello, Chen/);
        } finally {
            close();
        }
    });

    test('reports an unknown tool as an error instead of hanging', async () => {
        const { send, close } = await connect();

        try {
            const response = await send('tools/call', { name: 'no_such_tool', arguments: {} });

            // The SDK answers rather than throwing, so a client gets a usable
            // failure. Either shape is valid; silence is not.
            assert.ok(
                response.error || response.result?.isError,
                'an unknown tool should come back as an error'
            );
        } finally {
            close();
        }
    });
});
