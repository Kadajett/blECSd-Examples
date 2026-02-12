/**
 * Structured logging to stderr with timestamps and optional context tags.
 *
 * All output goes to stderr so it doesn't interfere with stdout-based
 * terminal rendering in blECSd mode.
 *
 * @module agent-orchestrator/utils/logger
 */

/**
 * Formats a timestamp for log output.
 */
function timestamp(): string {
	return new Date().toISOString();
}

/**
 * Formats an error for logging, extracting the message if it's an Error instance.
 */
function formatError(err: unknown): string {
	if (err instanceof Error) {
		return err.message;
	}
	return String(err);
}

/**
 * Logs an informational message to stderr.
 *
 * @param message - Log message
 * @param tag - Optional context tag (e.g., "mcp", "rag", "tmux")
 */
export function log(message: string, tag?: string): void {
	const prefix = tag ? `[${tag}]` : '';
	process.stderr.write(`${timestamp()} INFO ${prefix} ${message}\n`);
}

/**
 * Logs a warning to stderr.
 *
 * @param message - Warning message
 * @param err - Optional error object for additional context
 * @param tag - Optional context tag
 */
export function warn(message: string, err?: unknown, tag?: string): void {
	const prefix = tag ? `[${tag}]` : '';
	const suffix = err ? `: ${formatError(err)}` : '';
	process.stderr.write(`${timestamp()} WARN ${prefix} ${message}${suffix}\n`);
}

/**
 * Logs an error to stderr.
 *
 * @param message - Error message
 * @param err - Optional error object for additional context
 * @param tag - Optional context tag
 */
export function error(message: string, err?: unknown, tag?: string): void {
	const prefix = tag ? `[${tag}]` : '';
	const suffix = err ? `: ${formatError(err)}` : '';
	process.stderr.write(`${timestamp()} ERROR ${prefix} ${message}${suffix}\n`);
}
