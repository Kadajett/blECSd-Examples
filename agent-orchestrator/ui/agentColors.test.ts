// @ts-ignore Vitest is provided at runtime via npx
import { describe, it, expect } from 'vitest';
import {
	AGENT_PALETTES,
	ROLE_COLORS,
	getAgentPalette,
	getRolePalette,
} from './agentColors.js';

describe('ui/agentColors', () => {
	it('provides 8 distinct palettes', () => {
		expect(AGENT_PALETTES).toHaveLength(8);
		expect(new Set(AGENT_PALETTES.map((p) => p.primary)).size).toBe(8);
	});

	it('getAgentPalette wraps around for index > 7', () => {
		expect(getAgentPalette(8)).toEqual(getAgentPalette(0));
	});

	it('each palette has valid hex primary', () => {
		for (const palette of AGENT_PALETTES) {
			expect(palette.primary).toMatch(/^#[0-9a-fA-F]{6}$/);
		}
	});

	it('each palette has valid hex secondary', () => {
		for (const palette of AGENT_PALETTES) {
			expect(palette.secondary).toMatch(/^#[0-9a-fA-F]{6}$/);
		}
	});

	it('getRolePalette returns orchestrator/sidebar/header colors', () => {
		expect(getRolePalette('orchestrator')).toEqual(ROLE_COLORS.orchestrator);
		expect(getRolePalette('sidebar')).toEqual(ROLE_COLORS.sidebar);
		expect(getRolePalette('header')).toEqual(ROLE_COLORS.header);
	});

	it('AGENT_PALETTES has no duplicate primaries', () => {
		const uniquePrimaries = new Set(AGENT_PALETTES.map((p) => p.primary));
		expect(uniquePrimaries.size).toBe(AGENT_PALETTES.length);
	});

	it('all labels are non-empty strings', () => {
		for (const palette of AGENT_PALETTES) {
			expect(typeof palette.label).toBe('string');
			expect(palette.label.trim().length).toBeGreaterThan(0);
		}
	});
});
