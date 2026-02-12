/**
 * Git worktree management for worker agents.
 *
 * Each worker can operate in its own git worktree to avoid conflicts.
 * Worktrees are created as siblings of the main repo directory.
 *
 * @module agent-orchestrator/worktrees
 */

import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { warn } from './utils/logger.js';
import type { WorktreeInfo } from './types.js';

/**
 * Creates a git worktree for a worker.
 *
 * Creates `../worktree-{name}` relative to the workspace root
 * on a new branch `worker/{name}`.
 *
 * @param workspaceRoot - The main repository root directory
 * @param name - Human-readable worker name
 * @returns WorktreeInfo with the path and branch name
 */
export function createWorktree(workspaceRoot: string, name: string): WorktreeInfo {
	const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '-');
	const worktreePath = path.resolve(workspaceRoot, '..', `worktree-${sanitized}`);
	const branch = `worker/${sanitized}`;

	if (fs.existsSync(worktreePath)) {
		return { path: worktreePath, branch, name: sanitized };
	}

	try {
		execSync(
			`git worktree add "${worktreePath}" -b "${branch}"`,
			{ cwd: workspaceRoot, encoding: 'utf8', timeout: 15000 },
		);
	} catch {
		try {
			execSync(
				`git worktree add "${worktreePath}" "${branch}"`,
				{ cwd: workspaceRoot, encoding: 'utf8', timeout: 15000 },
			);
		} catch (innerErr) {
			throw new Error(
				`Failed to create worktree: ${innerErr instanceof Error ? innerErr.message : String(innerErr)}`,
			);
		}
	}

	return { path: worktreePath, branch, name: sanitized };
}

/**
 * Removes a git worktree.
 *
 * @param workspaceRoot - The main repository root directory
 * @param name - Worker name (same as passed to createWorktree)
 * @param force - If true, use --force flag
 */
export function removeWorktree(
	workspaceRoot: string,
	name: string,
	force = false,
): void {
	const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '-');
	const worktreePath = path.resolve(workspaceRoot, '..', `worktree-${sanitized}`);

	if (!fs.existsSync(worktreePath)) {
		return;
	}

	const forceFlag = force ? ' --force' : '';
	try {
		execSync(
			`git worktree remove "${worktreePath}"${forceFlag}`,
			{ cwd: workspaceRoot, encoding: 'utf8', timeout: 15000 },
		);
	} catch (err) {
		warn(`Failed to remove worktree at ${worktreePath}`, err, 'worktree');
		if (force) {
			try {
				fs.rmSync(worktreePath, { recursive: true, force: true });
				execSync('git worktree prune', { cwd: workspaceRoot, encoding: 'utf8', timeout: 5000 });
			} catch (pruneErr) {
				warn('Force worktree cleanup also failed', pruneErr, 'worktree');
			}
		}
	}
}

/**
 * Lists active git worktrees created for workers.
 *
 * @param workspaceRoot - The main repository root directory
 * @returns Array of worker worktree info (only worker/* branches)
 */
export function listWorktrees(workspaceRoot: string): readonly WorktreeInfo[] {
	try {
		const output = execSync(
			'git worktree list --porcelain',
			{ cwd: workspaceRoot, encoding: 'utf8', timeout: 5000 },
		);

		const worktrees: WorktreeInfo[] = [];
		let currentPath = '';
		let currentBranch = '';

		for (const line of output.split('\n')) {
			if (line.startsWith('worktree ')) {
				currentPath = line.slice('worktree '.length);
			} else if (line.startsWith('branch refs/heads/')) {
				currentBranch = line.slice('branch refs/heads/'.length);
			} else if (line === '') {
				if (currentPath && currentBranch.startsWith('worker/')) {
					const name = currentBranch.slice('worker/'.length);
					worktrees.push({ path: currentPath, branch: currentBranch, name });
				}
				currentPath = '';
				currentBranch = '';
			}
		}

		return worktrees;
	} catch (err) {
		warn('Failed to list git worktrees', err, 'worktree');
		return [];
	}
}
