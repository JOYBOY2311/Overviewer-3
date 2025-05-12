import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  { files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"], languageOptions: { globals: globals.browser } },
  ...tseslint.configs.recommended,
  {
    files: ["lib/**/*.js", "webpack.config.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off"
    }
  }
];