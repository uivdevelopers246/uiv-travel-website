// vitest.config.cjs
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
      { find: /^@\/lib\/(.*)$/, replacement: path.resolve(__dirname, "lib/$1") },
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, "src/$1") },
    ],
  },
  test: {
    environment: "node", // avoids needing jsdom
  },
};
