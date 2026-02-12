/**
 * Agent management module - lifecycle, orchestrator, workers, communication.
 *
 * @module agent-orchestrator/agents
 */

export {
	spawnAgent,
	terminateAgent,
	restartAgent,
	terminateAllAgents,
} from './lifecycle.js';

export {
	spawnOrchestrator,
	buildMcpEnv,
	writeMcpConfigFile,
} from './orchestrator.js';

export {
	addWorker,
	removeWorker,
	removeFocusedWorker,
} from './worker.js';

export {
	sendToAgent,
	sendToWorker,
	sendToOrchestrator,
	updateWorkerContextFile,
} from './communication.js';
