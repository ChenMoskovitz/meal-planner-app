/**
 * A stand-in for the Supabase client, for tests.
 *
 * Only the query shape recipes.js actually uses is implemented:
 *
 *     client.from(table).select(columns).order(column).eq(column, value)
 *
 * The real builder is thenable rather than a promise, so awaiting it runs the
 * query. This mirrors that with a then() method, which is what lets the same
 * code await the builder with or without the optional .eq() on the end.
 *
 * Deliberately not a mocking library: the fake is small enough to read, and when
 * it drifts from the real client a protocol test fails against the real thing.
 */
export function fakeSupabase({ recipes = [], error = null } = {}) {
    const calls = [];

    function builder(table) {
        const state = { table, filters: {} };

        const thenable = {
            select(columns) {
                state.columns = columns;
                return thenable;
            },
            order(column) {
                state.order = column;
                return thenable;
            },
            eq(column, value) {
                state.filters[column] = value;
                return thenable;
            },
            then(resolve) {
                calls.push(state);

                if (error) return resolve({ data: null, error });

                let rows = state.table === 'recipes' ? [...recipes] : [];

                for (const [column, value] of Object.entries(state.filters)) {
                    rows = rows.filter(row => row[column] === value);
                }

                if (state.order) {
                    rows.sort((a, b) => String(a[state.order]).localeCompare(String(b[state.order])));
                }

                return resolve({ data: rows, error: null });
            }
        };

        return thenable;
    }

    return {
        from: table => builder(table),
        // Lets a test assert on what was asked of the database, not just what
        // came back — an ordered query and an unordered one return the same
        // rows for a single-row fixture.
        calls
    };
}
