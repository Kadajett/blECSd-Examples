#!/usr/bin/env node
/**
 * Seeds the RAG database with sample documents for demo purposes.
 *
 * Usage: npx tsx seed-rag.ts [--db ./orchestrator.db]
 */

import { openDatabase, insertRagDocument } from './db/index.js';

const dbPath = process.argv.includes('--db')
	? process.argv[process.argv.indexOf('--db') + 1] ?? './orchestrator.db'
	: './orchestrator.db';

const db = openDatabase(dbPath);

const sampleDocs = [
	{ agent: 'worker-1', chunk: 'Implemented JWT authentication with refresh token rotation. Uses HS256 signing.' },
	{ agent: 'worker-1', chunk: 'Auth middleware validates tokens on every request. Invalid tokens return 401.' },
	{ agent: 'worker-2', chunk: 'REST API routes: GET /users, POST /users, GET /users/:id, PUT /users/:id, DELETE /users/:id' },
	{ agent: 'worker-2', chunk: 'Added rate limiting middleware: 100 requests per 15 minutes per IP address.' },
	{ agent: 'worker-3', chunk: 'Database schema uses PostgreSQL with Drizzle ORM. Migrations in src/db/migrations/' },
	{ agent: 'worker-3', chunk: 'User table: id (uuid), email (unique), password_hash, created_at, updated_at' },
	{ agent: 'worker-1', chunk: 'Password hashing uses bcrypt with cost factor 12. Timing-safe comparison for auth.' },
	{ agent: 'orchestrator', chunk: 'Architecture decision: monorepo with pnpm workspaces. Packages: api, web, shared.' },
	{ agent: 'orchestrator', chunk: 'CI pipeline: lint -> typecheck -> test -> build -> deploy. GitHub Actions workflow.' },
	{ agent: 'worker-2', chunk: 'Error handling: all routes wrapped in async error handler. Zod validation at boundaries.' },
	{ agent: 'worker-3', chunk: 'Added connection pooling with pg-pool. Max 20 connections, idle timeout 30s.' },
	{ agent: 'worker-1', chunk: 'OAuth2 integration with Google and GitHub. Callback URLs configured per environment.' },
	{ agent: 'orchestrator', chunk: 'Deployment: Docker containers on Railway. Staging auto-deploys from main branch.' },
	{ agent: 'worker-2', chunk: 'WebSocket support for real-time notifications. Uses ws library with heartbeat ping.' },
	{ agent: 'worker-3', chunk: 'Redis caching layer for frequently accessed data. TTL 5 minutes for user profiles.' },
	{ agent: 'worker-1', chunk: 'Session management: HTTP-only secure cookies. SameSite=Strict in production.' },
	{ agent: 'worker-2', chunk: 'File upload endpoint: POST /files. Max 10MB, accepts images and PDFs only.' },
	{ agent: 'worker-3', chunk: 'Search functionality uses pg_trgm extension for fuzzy text matching on user names.' },
	{ agent: 'orchestrator', chunk: 'Monitoring: Prometheus metrics endpoint at /metrics. Grafana dashboards for latency.' },
	{ agent: 'worker-1', chunk: 'CORS configuration allows specific origins. Credentials mode enabled for auth cookies.' },
	{ agent: 'worker-2', chunk: 'Pagination: cursor-based for lists. Returns next_cursor in response headers.' },
	{ agent: 'worker-3', chunk: 'Database indexes: email (unique), created_at (btree), full_name (gin trgm).' },
	{ agent: 'orchestrator', chunk: 'Testing strategy: unit tests for business logic, integration tests for API endpoints.' },
	{ agent: 'worker-1', chunk: 'Two-factor authentication with TOTP. QR code generation for authenticator apps.' },
	{ agent: 'worker-2', chunk: 'Health check endpoint at /health. Returns DB connection status and memory usage.' },
];

const tokens = (text: string): string =>
	text
		.toLowerCase()
		.split(/\s+/)
		.filter((w) => w.length > 2)
		.join(' ');

for (const doc of sampleDocs) {
	insertRagDocument(db, doc.agent, doc.chunk, tokens(doc.chunk));
}

console.log(`Seeded ${sampleDocs.length} RAG documents into ${dbPath}`);

db.close();
