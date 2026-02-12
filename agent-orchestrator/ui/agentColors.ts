/**
 * Per-agent color palettes for tmux pane borders.
 *
 * Each agent gets a unique color identity from the Tokyo Night extended palette.
 * Role-based colors (orchestrator, sidebar, header) use fixed assignments.
 *
 * @module agent-orchestrator/ui/agentColors
 */

// =============================================================================
// TYPES
// =============================================================================

/** Color palette for an agent pane. */
export interface AgentColorPalette {
	/** Primary color (bright, used for active borders and labels). */
	readonly primary: string;
	/** Secondary color (dim, used for background tints). */
	readonly secondary: string;
	/** Human-readable color name. */
	readonly label: string;
}

// =============================================================================
// PALETTES
// =============================================================================

/** Eight distinct agent color palettes from the Tokyo Night extended palette. */
export const AGENT_PALETTES: readonly AgentColorPalette[] = [
	{ primary: '#7dcfff', secondary: '#1e3a5f', label: 'Cyan' },
	{ primary: '#bb9af7', secondary: '#2d2640', label: 'Purple' },
	{ primary: '#9ece6a', secondary: '#2a3d1f', label: 'Green' },
	{ primary: '#ff9e64', secondary: '#3d2a1a', label: 'Orange' },
	{ primary: '#7aa2f7', secondary: '#1e2a4f', label: 'Blue' },
	{ primary: '#f7768e', secondary: '#3d1a24', label: 'Rose' },
	{ primary: '#e0af68', secondary: '#3d3018', label: 'Gold' },
	{ primary: '#73daca', secondary: '#1a3d35', label: 'Teal' },
] as const;

/** Fixed color assignments for non-worker roles. */
export const ROLE_COLORS: Record<'orchestrator' | 'sidebar' | 'header', AgentColorPalette> = {
	orchestrator: AGENT_PALETTES[6]!, // Gold
	sidebar: AGENT_PALETTES[7]!,      // Teal
	header: AGENT_PALETTES[4]!,       // Blue
};

// =============================================================================
// ACCESSORS
// =============================================================================

/**
 * Returns a color palette for a worker agent by index (wraps around).
 *
 * @param index - Zero-based worker index
 * @returns Agent color palette
 */
export function getAgentPalette(index: number): AgentColorPalette {
	return AGENT_PALETTES[index % AGENT_PALETTES.length]!;
}

/**
 * Returns the fixed color palette for a named role.
 *
 * @param role - Role name
 * @returns Agent color palette for the role
 */
export function getRolePalette(role: 'orchestrator' | 'sidebar' | 'header'): AgentColorPalette {
	return ROLE_COLORS[role];
}
