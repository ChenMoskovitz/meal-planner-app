/**
 * A stand-in for the Supabase client, for tests.
 *
 * Implements only the query shapes this package actually uses:
 *
 *     from(t).select(cols).order(col)
 *     from(t).select(cols).ilike(col, value).limit(n)
 *     from(t).select(cols).eq(col, value).eq(col, value).limit(n)
 *     from(t).insert([rows]).select(cols)
 *     from(t).update(values).eq(col, value).eq(col, value)
 *
 * The real builder is thenable rather than a promise, so awaiting it runs the
 * query. This mirrors that with a then() method, which is what lets the same
 * code await a chain of any length.
 *
 * Deliberately not a mocking library: it is small enough to read, it holds real
 * rows so a write is visible to a later read in the same test, and when it
 * drifts from the real client a protocol test fails against the real thing.
 */

let nextId = 0;

export function fakeSupabase({ recipes = [], ingredients = [], recipe_ingredients = [], error = null } = {}) {
    const tables = { recipes, ingredients, recipe_ingredients };
    const calls = [];

    function builder(table) {
        const state = { table, filters: [], operation: 'select' };

        function matching() {
            return (tables[table] ?? []).filter(row =>
                state.filters.every(({ column, value, kind }) =>
                    kind === 'ilike'
                        ? String(row[column]).toLowerCase() === String(value).toLowerCase()
                        : row[column] === value
                )
            );
        }

        const chain = {
            select(columns) {
                state.columns = columns;
                return chain;
            },
            order(column) {
                state.order = column;
                return chain;
            },
            eq(column, value) {
                state.filters.push({ column, value, kind: 'eq' });
                return chain;
            },
            // The real ilike is a pattern match; the only use here is a whole
            // name, so case-insensitive equality is the honest simplification.
            ilike(column, value) {
                state.filters.push({ column, value, kind: 'ilike' });
                return chain;
            },
            limit(count) {
                state.limit = count;
                return chain;
            },
            insert(rows) {
                state.operation = 'insert';
                state.rows = rows;
                return chain;
            },
            update(values) {
                state.operation = 'update';
                state.values = values;
                return chain;
            },
            then(resolve) {
                // Flattened for assertions: `filters` keeps the match kind,
                // `where` is the plain {column: value} a test usually wants.
                state.where = Object.fromEntries(
                    state.filters.map(({ column, value }) => [column, value])
                );
                calls.push(state);

                if (error) return resolve({ data: null, error });

                if (state.operation === 'insert') {
                    const inserted = state.rows.map(row => ({ id: `fake-${nextId++}`, ...row }));
                    tables[table] = [...(tables[table] ?? []), ...inserted];

                    return resolve({ data: inserted, error: null });
                }

                if (state.operation === 'update') {
                    const targets = matching();
                    for (const row of targets) Object.assign(row, state.values);

                    return resolve({ data: targets, error: null });
                }

                // Copies, like the real client: rows come back as deserialized
                // JSON, so a later update cannot mutate what an earlier read
                // returned. Handing out references hides that distinction.
                let rows = matching().map(row => ({ ...row }));

                if (state.order) {
                    rows = [...rows].sort((a, b) =>
                        String(a[state.order]).localeCompare(String(b[state.order]))
                    );
                }

                if (state.limit !== undefined) rows = rows.slice(0, state.limit);

                return resolve({ data: rows, error: null });
            }
        };

        return chain;
    }

    return {
        from: table => builder(table),
        // Lets a test assert on what was asked of the database, not only on what
        // came back — an ordered query and an unordered one return the same rows
        // for a single-row fixture.
        calls,
        // The rows as they stand, so a test can check what a write actually did.
        tables
    };
}
