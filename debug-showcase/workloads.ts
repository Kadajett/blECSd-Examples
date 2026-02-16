/**
 * Configurable workloads for debug-showcase.
 * Each workload creates entities with different characteristics to stress test
 * the debug tools and demonstrate performance monitoring.
 */

import { addEntity, removeEntity, setPosition, setZIndex, type Entity, type World } from 'blecsd';
import { setVelocity } from 'blecsd/components';

export interface WorkloadConfig {
	readonly entityCount: number;
	readonly minSpeed: number;
	readonly maxSpeed: number;
	readonly description: string;
}

export const WORKLOADS = {
	light: {
		entityCount: 50,
		minSpeed: 10,
		maxSpeed: 30,
		description: 'Light workload (50 entities)',
	},
	medium: {
		entityCount: 200,
		minSpeed: 15,
		maxSpeed: 40,
		description: 'Medium workload (200 entities)',
	},
	heavy: {
		entityCount: 500,
		minSpeed: 20,
		maxSpeed: 50,
		description: 'Heavy workload (500 entities)',
	},
} as const;

export interface Particle {
	readonly eid: Entity;
	readonly char: string;
	readonly color: number;
}

const PARTICLE_CHARS = ['█', '▓', '▒', '░', '■', '●', '◆', '◉', '★', '♦'];

const COLORS = [
	0xff5555ff, // Red
	0x55ff55ff, // Green
	0x5555ffff, // Blue
	0xffff55ff, // Yellow
	0xff55ffff, // Magenta
	0x55ffffff, // Cyan
	0xffaa55ff, // Orange
	0xaa55ffff, // Purple
];

/**
 * Create a single particle entity
 */
function createParticle(
	world: World,
	width: number,
	height: number,
	index: number,
	config: WorkloadConfig,
): Particle {
	const eid = addEntity(world);

	// Random position within bounds
	const x = Math.random() * (width - 2) + 1;
	const y = Math.random() * (height - 2) + 1;
	setPosition(world, eid, x, y);

	// Random velocity
	const angle = Math.random() * Math.PI * 2;
	const speed = config.minSpeed + Math.random() * (config.maxSpeed - config.minSpeed);
	const vx = Math.cos(angle) * speed;
	const vy = Math.sin(angle) * speed;
	setVelocity(world, eid, vx, vy);

	// Set z-index
	setZIndex(world, eid, index);

	// Random appearance
	const color = COLORS[index % COLORS.length] ?? COLORS[0] ?? 0xffffffff;
	const char = PARTICLE_CHARS[index % PARTICLE_CHARS.length] ?? '█';

	return { eid, char, color };
}

/**
 * Create a workload with specified config
 */
export function createWorkload(
	world: World,
	width: number,
	height: number,
	config: WorkloadConfig,
): Particle[] {
	const particles: Particle[] = [];

	for (let i = 0; i < config.entityCount; i++) {
		particles.push(createParticle(world, width, height, i, config));
	}

	return particles;
}

/**
 * Remove all particles from the world
 */
export function clearParticles(world: World, particles: Particle[]): void {
	for (const particle of particles) {
		removeEntity(world, particle.eid);
	}
}

/**
 * Burst mode: rapidly create and destroy entities
 */
export interface BurstState {
	particles: Particle[];
	lastBurst: number;
	burstCount: number;
}

export function createBurstState(): BurstState {
	return {
		particles: [],
		lastBurst: 0,
		burstCount: 0,
	};
}

export function updateBurst(
	world: World,
	state: BurstState,
	width: number,
	height: number,
	now: number,
): BurstState {
	// Every 100ms, remove old particles and create new ones
	if (now - state.lastBurst >= 100) {
		// Remove old particles
		for (const particle of state.particles) {
			removeEntity(world, particle.eid);
		}

		// Create new burst
		const burstSize = 20 + Math.floor(Math.random() * 30);
		const particles: Particle[] = [];
		for (let i = 0; i < burstSize; i++) {
			particles.push(
				createParticle(world, width, height, i, {
					entityCount: burstSize,
					minSpeed: 30,
					maxSpeed: 60,
					description: 'Burst mode',
				}),
			);
		}

		return {
			particles,
			lastBurst: now,
			burstCount: state.burstCount + 1,
		};
	}

	return state;
}
