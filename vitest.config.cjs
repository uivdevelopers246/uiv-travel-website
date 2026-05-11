// vitest.config.cjs
/* eslint-disable @typescript-eslint/no-require-imports -- Vitest config is loaded as CommonJS in this repo. */
const path = require("path");

/** @type {import('vitest/config').UserConfig} */
module.exports = {
  resolve: {
    alias: [
      // IMPORTANT: put the more specific aliases first
      {
        find: /^@\/api-shared\/(.*)$/,
        replacement: path.resolve(__dirname, "src/app/api/_shared/$1"),
      },
      {
        find: /^server-only$/,
        replacement: path.resolve(__dirname, "node_modules/server-only/empty.js"),
      },
      { find: /^@\/lib\/(.*)$/, replacement: path.resolve(__dirname, "lib/$1") },
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, "src/$1") },
    ],
  },
  test: {
    environment: "node", // avoids needing jsdom
  },
};
