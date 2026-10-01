import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        /**
         * Only the app's own tests.
         *
         * Vitest's default pattern picks up every *.test.js in the project,
         * including mcp/server.test.js. That file belongs to a separate package
         * that runs on Node's built-in test runner, so Vitest finds no suite it
         * recognises and fails the file with "No test suite found" — a green
         * local run only because mcp/ had not been written yet.
         *
         * The mcp package is covered by its own CI job (`npm test` inside mcp/).
         */
        include: ['src/**/*.test.{js,jsx}']
    }
});
