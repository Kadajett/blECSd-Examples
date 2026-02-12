/**
 * Pure TypeScript TF-IDF implementation for RAG.
 *
 * @module agent-orchestrator/db/rag
 */

import type Database from 'better-sqlite3';
import type { RagSearchResult } from '../types.js';
import { STOP_WORDS, RAG_CHUNK_SIZE } from '../config.js';
import { getAllRagDocuments, insertRagDocument } from './operations.js';

// =============================================================================
// DATA STRUCTURES
// =============================================================================

interface RagIndexDocument {
	readonly id: number;
	readonly sourceAgentId: string;
	readonly chunk: string;
	readonly termFreqs: Map<string, number>;
}

export interface RagIndex {
	documents: RagIndexDocument[];
	documentFreqs: Map<string, number>;
	totalDocs: number;
}

// =============================================================================
// INDEX MANAGEMENT
// =============================================================================

/**
 * Create an empty RAG index.
 *
 * @returns Empty RAG index
 */
export function createRagIndex(): RagIndex {
	return {
		documents: [],
		documentFreqs: new Map(),
		totalDocs: 0,
	};
}

/**
 * Tokenize text into normalized tokens.
 *
 * @param text - Input text
 * @returns Array of tokens
 */
export function tokenize(text: string): string[] {
	const tokens = text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length >= 2)
		.filter((token) => !STOP_WORDS.has(token));

	return tokens;
}

/**
 * Compute term frequency map for tokens.
 *
 * @param tokens - Array of tokens
 * @returns Map of term to frequency (term count / total tokens)
 */
export function computeTermFrequencies(tokens: string[]): Map<string, number> {
	if (tokens.length === 0) {
		return new Map();
	}

	const counts = new Map<string, number>();
	for (const token of tokens) {
		counts.set(token, (counts.get(token) ?? 0) + 1);
	}

	const freqs = new Map<string, number>();
	for (const [term, count] of counts) {
		freqs.set(term, count / tokens.length);
	}

	return freqs;
}

/**
 * Add a document to the RAG index.
 *
 * @param index - RAG index
 * @param id - Document ID
 * @param sourceAgentId - Agent ID that produced this document
 * @param chunk - Text chunk
 */
export function addDocumentToIndex(
	index: RagIndex,
	id: number,
	sourceAgentId: string,
	chunk: string,
): void {
	const tokens = tokenize(chunk);
	const termFreqs = computeTermFrequencies(tokens);

	// Update document frequencies
	const uniqueTerms = new Set(tokens);
	for (const term of uniqueTerms) {
		index.documentFreqs.set(term, (index.documentFreqs.get(term) ?? 0) + 1);
	}

	// Add document
	index.documents.push({
		id,
		sourceAgentId,
		chunk,
		termFreqs,
	});

	index.totalDocs++;
}

/**
 * Search the RAG index using TF-IDF cosine similarity.
 *
 * @param index - RAG index
 * @param query - Query text
 * @param limit - Maximum number of results (default 10)
 * @returns Array of search results sorted by score descending
 */
export function searchIndex(
	index: RagIndex,
	query: string,
	limit = 10,
): RagSearchResult[] {
	const queryTokens = tokenize(query);
	if (queryTokens.length === 0) {
		return [];
	}

	const queryTermFreqs = computeTermFrequencies(queryTokens);

	// Calculate TF-IDF scores for each document
	const results: Array<{ chunk: string; sourceAgentId: string; score: number }> = [];

	for (const doc of index.documents) {
		let score = 0;

		for (const [term, queryTf] of queryTermFreqs) {
			const docTf = doc.termFreqs.get(term) ?? 0;
			if (docTf === 0) continue;

			// IDF = log(totalDocs / (1 + documentFreq))
			const docFreq = index.documentFreqs.get(term) ?? 0;
			const idf = Math.log(index.totalDocs / (1 + docFreq));

			// TF-IDF score contribution
			score += queryTf * docTf * idf;
		}

		if (score > 0) {
			results.push({
				chunk: doc.chunk,
				sourceAgentId: doc.sourceAgentId,
				score,
			});
		}
	}

	// Sort by score descending and take top N
	results.sort((a, b) => b.score - a.score);
	return results.slice(0, limit);
}

/**
 * Chunk text into smaller segments.
 *
 * @param text - Input text
 * @param chunkSize - Target chunk size in characters (default RAG_CHUNK_SIZE)
 * @returns Array of text chunks
 */
export function chunkText(text: string, chunkSize = RAG_CHUNK_SIZE): string[] {
	if (text.length <= chunkSize) {
		return [text];
	}

	const chunks: string[] = [];
	let start = 0;

	while (start < text.length) {
		let end = start + chunkSize;

		// Try to split on sentence boundaries
		if (end < text.length) {
			const nextPeriod = text.indexOf('.', end);
			const nextNewline = text.indexOf('\n', end);
			const nextQuestion = text.indexOf('?', end);
			const nextExclamation = text.indexOf('!', end);

			const boundaries = [nextPeriod, nextNewline, nextQuestion, nextExclamation]
				.filter((idx) => idx !== -1 && idx < end + 100);

			if (boundaries.length > 0) {
				end = Math.min(...boundaries) + 1;
			}
		}

		chunks.push(text.slice(start, end).trim());
		start = end;
	}

	return chunks.filter((chunk) => chunk.length > 0);
}

/**
 * Rebuild the RAG index from all documents in the database.
 *
 * @param db - SQLite database instance
 * @param index - RAG index to rebuild
 */
export function rebuildIndexFromDb(db: Database.Database, index: RagIndex): void {
	// Clear existing index
	index.documents = [];
	index.documentFreqs.clear();
	index.totalDocs = 0;

	// Load all documents and rebuild
	const docs = getAllRagDocuments(db);
	for (const doc of docs) {
		addDocumentToIndex(index, doc.id, doc.sourceAgentId, doc.chunk);
	}
}

/**
 * Ingest agent output lines into RAG.
 *
 * @param db - SQLite database instance
 * @param index - RAG index
 * @param agentId - Agent ID
 * @param lines - Output lines to ingest
 */
export function ingestAgentOutput(
	db: Database.Database,
	index: RagIndex,
	agentId: string,
	lines: string[],
): void {
	if (lines.length === 0) {
		return;
	}

	// Join lines and chunk
	const text = lines.join('\n');
	const chunks = chunkText(text);

	// Insert each chunk into DB and index
	for (const chunk of chunks) {
		const tokens = tokenize(chunk);
		const tokensJson = JSON.stringify(tokens);

		insertRagDocument(db, agentId, chunk, tokensJson);

		// Get the ID of the inserted document
		// Since we're in a synchronous context, we can use lastInsertRowid
		const stmt = db.prepare('SELECT last_insert_rowid() as id');
		const result = stmt.get() as { id: number } | undefined;
		const docId = result?.id ?? 0;

		addDocumentToIndex(index, docId, agentId, chunk);
	}
}
