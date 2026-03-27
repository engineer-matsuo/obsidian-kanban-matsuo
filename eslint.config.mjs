import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{
		ignores: ["**/*.test.ts"],
	},
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				project: "./tsconfig.json",
			},
			globals: {
				window: "readonly",
				document: "readonly",
				navigator: "readonly",
				crypto: "readonly",
				requestAnimationFrame: "readonly",
				cancelAnimationFrame: "readonly",
				setTimeout: "readonly",
				clearTimeout: "readonly",
				NodeListOf: "readonly",
				HTMLElement: "readonly",
				MouseEvent: "readonly",
				KeyboardEvent: "readonly",
				DragEvent: "readonly",
				TouchEvent: "readonly",
				Node: "readonly",
			},
		},
		rules: {
			"no-console": "warn",
			"prefer-const": "error",
			"no-var": "error",
			eqeqeq: ["error", "always", { null: "ignore" }],
		},
	},
]);
