import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  ...tseslint.config(eslint.configs.recommended, tseslint.configs.recommended),
  {
    ignores: [
      "node_modules",
      "dist",
      "decrypt_example_v1.ts",
      "decrypt_example_v2.ts",
    ],
  },
];
