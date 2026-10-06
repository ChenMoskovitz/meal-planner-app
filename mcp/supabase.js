/**
 * Supabase access for the MCP server.
 *
 * Three things differ from the browser client in src/config/supabaseClient.js:
 *
 * 1. `import.meta.env` does not exist in Node — Vite rewrites those at build
 *    time. Credentials come from process.env instead.
 * 2. There is no logged-in user. Every table here is scoped by user_id and
 *    filtered by row-level security, so an unauthenticated client connects
 *    happily and returns zero rows with no error. Signing in is not optional.
 * 3. No localStorage, so the session lives in memory for the life of the
 *    process. The server signs in once at startup.
 *
 * The account is deliberately NOT the TEST_USER_* one: the Playwright suite
 * deletes every row that account owns at the start of each run, so anything
 * created here would vanish the next time CI ran.
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(HERE, '..', '.env');

/**
 * Loads the project's .env into process.env.
 *
 * Done in code rather than with `node --env-file` because an MCP client spawns
 * this server directly — there is no shell to pass flags. process.loadEnvFile is
 * built into Node, so this needs no dotenv dependency.
 *
 * Variables already set win: a real environment (CI, or a client's own `env`
 * block) should not be overridden by a stale local file.
 */
export function loadEnv() {
    if (!existsSync(ENV_FILE)) return;

    const before = { ...process.env };
    process.loadEnvFile(ENV_FILE);

    for (const [key, value] of Object.entries(before)) {
        if (value !== undefined) process.env[key] = value;
    }
}

function required(name) {
    const value = process.env[name];

    // Naming the variable matters: the alternative is a stack trace from inside
    // supabase-js about an undefined URL.
    if (!value) throw new Error(`Missing ${name} — add it to ${ENV_FILE}`);

    return value;
}

/**
 * Returns a client already signed in as the configured user.
 *
 * `persistSession: false` because there is nowhere to persist to, and
 * `autoRefreshToken: false` because the process is short-lived; a background
 * refresh timer would otherwise keep Node's event loop alive after the client
 * disconnects and leave the server running invisibly.
 */
export async function signedInClient() {
    loadEnv();

    const client = createClient(
        required('VITE_SUPABASE_URL'),
        required('VITE_SUPABASE_ANON_KEY'),
        { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data, error } = await client.auth.signInWithPassword({
        email: required('MEAL_PLANNER_EMAIL'),
        password: required('MEAL_PLANNER_PASSWORD')
    });

    if (error) throw new Error(`Could not sign in to Supabase: ${error.message}`);

    return { client, user: data.user };
}
