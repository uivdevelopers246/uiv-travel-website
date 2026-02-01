// vitest.config.cjs
const path = require("path");

/** @type {import('vitest/config').UserConfig} */
module.exports = {
  resolve: {
    alias: [
      // IMPORTANT: put the more specific alias first
      { find: /^@\/lib\/(.*)$/, replacement: path.resolve(__dirname, "lib/$1") },
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, "src/$1") },
    ],
  },
  test: {
    environment: "node", // avoids needing jsdom
  },
};
