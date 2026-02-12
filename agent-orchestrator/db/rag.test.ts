// @ts-ignore Vitest is provided at runtime via npx
import { describe, it, expect } from 'vitest';
import {
	tokenize,
	computeTermFrequencies,
	createRagIndex,
	addDocumentToIndex,
	searchIndex,
	chunkText,
} from './rag.js';

describe('db/rag tokenize', () => {
	it('tokenizes normal text, lowercases, and removes stop words', () => {
		expect(tokenize('Hello, world! This is a test.')).toEqual(['hello', 'world', 'test']);
	});

	it('returns empty array for empty input', () => {
		expect(tokenize('')).toEqual([]);
	});

	it('handles unicode by preserving ASCII token fragments only', () => {
		const tokens = tokenize('Привет café naïve 你好 hello');
		expect(tokens).toContain('hello');
		expect(tokens).not.toContain('привет');
		expect(tokens).not.toContain('你好');
	});

	it('handles punctuation and keeps numeric tokens', () => {
		expect(tokenize('Error: #404, code=500; retry?')).toEqual(['error', '404', 'code', '500', 'retry']);
	});
});

describe('db/rag computeTermFrequencies', () => {
	it('computes normalized frequencies', () => {
		const tf = computeTermFrequencies(['alpha', 'beta', 'alpha']);
		expect(tf.get('alpha')).toBeCloseTo(2 / 3, 8);
		expect(tf.get('beta')).toBeCloseTo(1 / 3, 8);
		expect(tf.size).toBe(2);
	});

	it('returns empty map for empty token input', () => {
		expect(computeTermFrequencies([]).size).toBe(0);
	});
});

describe('db/rag addDocumentToIndex + searchIndex', () => {
	it('indexes documents and ranks more relevant content first', () => {
		const index = createRagIndex();
		addDocumentToIndex(index, 1, 'agent-a', 'alpha alpha uniquealpha');
		addDocumentToIndex(index, 2, 'agent-b', 'alpha beta');
		addDocumentToIndex(index, 3, 'agent-c', 'gamma delta');

		const results = searchIndex(index, 'uniquealpha alpha', 5);
		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({ sourceAgentId: 'agent-a' });
		expect(results[0]?.score).toBeGreaterThan(0);
	});

	it('returns empty results for non-tokenizable query', () => {
		const index = createRagIndex();
		addDocumentToIndex(index, 1, 'agent-a', 'alpha beta gamma');
		expect(searchIndex(index, 'a the is', 5)).toEqual([]);
	});
});

describe('db/rag chunkText', () => {
	it('prefers sentence boundaries near chunk edge', () => {
		const text = 'A'.repeat(24) + '. Next sentence follows. Final!';
		const chunks = chunkText(text, 20);
		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks[0]?.endsWith('.')).toBe(true);
	});

	it('returns short text as a single chunk', () => {
		expect(chunkText('short text', 100)).toEqual(['short text']);
	});

	it('splits very long text into non-empty bounded chunks', () => {
		const text = 'Lorem ipsum dolor sit amet. '.repeat(200);
		const chunks = chunkText(text, 100);
		expect(chunks.length).toBeGreaterThan(10);
		expect(chunks.every((chunk) => chunk.length > 0)).toBe(true);
		expect(chunks.every((chunk) => chunk.length <= 200)).toBe(true);
	});
});
