const config = {
	test: {
		environment: 'node',
		include: ['**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json-summary'],
			reportsDirectory: './coverage',
			exclude: ['**/*.test.ts', 'dist/**', 'node_modules/**'],
		},
	},
};

export default config;
