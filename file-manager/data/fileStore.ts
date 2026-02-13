/**
 * FileStore manages the file data with sorting and filtering.
 * @module data/fileStore
 */

import type { Entity, World } from 'blecsd';
import { sortByName } from 'blecsd';
import { SortDirection, SortField, type FileManagerConfig } from '../config';
import type { FileEntry } from './fileEntry';
import { FileType, fuzzyMatchEntry } from './fileEntry';
import { readDirectory, getParentPath, isRootPath } from './filesystem';
import { getSelectedIndices } from '../components';

/**
 * Fuzzy match info for a file entry.
 */
export interface EntryMatchInfo {
	/** Match score (0-1) */
	readonly score: number;
	/** Matched character indices for highlighting */
	readonly indices: readonly number[];
}

/**
 * FileStore state manages file entries outside of ECS.
 * Only UI state (selection, viewport) is in ECS; data is here.
 */
export interface FileStoreState {
	/** Raw entries from filesystem */
	rawEntries: FileEntry[];
	/** Filtered and sorted entries (what the UI sees) */
	displayEntries: FileEntry[];
	/** Fuzzy match info for display entries (for highlighting) */
	matchInfo: Map<number, EntryMatchInfo>;
	/** Current directory path */
	currentPath: string;
	/** Current filter query */
	filterQuery: string;
	/** Last error message */
	error: string | undefined;
}

/** @deprecated Use FileStoreState and functional API instead */
export type FileStore = FileStoreState;

/**
 * Creates a new FileStore state.
 */
export function createFileStore(): FileStoreState {
	return {
		rawEntries: [],
		displayEntries: [],
		matchInfo: new Map(),
		currentPath: '',
		filterQuery: '',
		error: undefined,
	};
}

/**
 * Gets the number of entries after filtering.
 */
export function fileStoreCount(store: FileStoreState): number {
	return store.displayEntries.length;
}

/**
 * Gets the total number of entries before filtering.
 */
export function fileStoreTotalCount(store: FileStoreState): number {
	return store.rawEntries.length;
}

/**
 * Loads a directory.
 */
export async function fileStoreLoadDirectory(
	store: FileStoreState,
	path: string,
	config: FileManagerConfig,
): Promise<boolean> {
	const result = await readDirectory(path);

	if (result.error) {
		store.error = result.error;
		return false;
	}

	store.currentPath = result.path;
	store.rawEntries = result.entries;
	store.error = undefined;

	fileStoreApplyFiltersAndSort(store, config);
	return true;
}

/**
 * Navigates to parent directory.
 */
export async function fileStoreGoUp(
	store: FileStoreState,
	config: FileManagerConfig,
): Promise<boolean> {
	if (isRootPath(store.currentPath)) {
		return false;
	}

	const parentPath = getParentPath(store.currentPath);
	return fileStoreLoadDirectory(store, parentPath, config);
}

/**
 * Sets the filter query and reapplies filters.
 */
export function fileStoreSetFilter(
	store: FileStoreState,
	query: string,
	config: FileManagerConfig,
): void {
	store.filterQuery = query;
	fileStoreApplyFiltersAndSort(store, config);
}

/**
 * Clears the filter.
 */
export function fileStoreClearFilter(
	store: FileStoreState,
	config: FileManagerConfig,
): void {
	store.filterQuery = '';
	fileStoreApplyFiltersAndSort(store, config);
}

/**
 * Re-sorts the entries with updated config.
 */
export function fileStoreResort(
	store: FileStoreState,
	config: FileManagerConfig,
): void {
	fileStoreApplyFiltersAndSort(store, config);
}

/**
 * Gets an entry at the given index.
 */
export function fileStoreGetEntryAt(
	store: FileStoreState,
	index: number,
): FileEntry | undefined {
	return store.displayEntries[index];
}

/**
 * Gets all display entries (for debugging/testing).
 */
export function fileStoreGetEntries(store: FileStoreState): readonly FileEntry[] {
	return store.displayEntries;
}

/**
 * Gets fuzzy match info for an entry at the given index.
 * Used for highlighting matched characters.
 */
export function fileStoreGetMatchInfo(
	store: FileStoreState,
	index: number,
): EntryMatchInfo | undefined {
	return store.matchInfo.get(index);
}

/**
 * Gets all selected file entries.
 */
export function fileStoreGetSelectedEntries(
	store: FileStoreState,
	world: World,
	listEid: Entity,
): FileEntry[] {
	const selectedIndices = getSelectedIndices(world, listEid);
	const entries: FileEntry[] = [];

	for (const index of selectedIndices) {
		const entry = fileStoreGetEntryAt(store, index);
		if (entry) {
			entries.push(entry);
		}
	}

	return entries;
}

/**
 * Calculates total size of all entries.
 */
export function fileStoreGetTotalSize(store: FileStoreState): number {
	return store.rawEntries.reduce((sum, entry) => sum + entry.size, 0);
}

/**
 * Gets the index of an entry by path.
 */
export function fileStoreFindIndexByPath(
	store: FileStoreState,
	path: string,
): number {
	return store.displayEntries.findIndex((entry) => entry.path === path);
}

/**
 * Gets the index of an entry by name.
 */
export function fileStoreFindIndexByName(
	store: FileStoreState,
	name: string,
): number {
	return store.displayEntries.findIndex((entry) => entry.name === name);
}

/**
 * Applies filters and sorting to raw entries.
 */
function fileStoreApplyFiltersAndSort(
	store: FileStoreState,
	config: FileManagerConfig,
): void {
	// Clear previous match info
	store.matchInfo.clear();

	// Filter with fuzzy matching
	const matchedEntries: Array<{ entry: FileEntry; score: number; indices: readonly number[] }> = [];

	for (const entry of store.rawEntries) {
		// Hidden files filter
		if (!config.showHidden && entry.isHidden) {
			continue;
		}
		// Search filter with fuzzy matching
		if (store.filterQuery) {
			const matchResult = fuzzyMatchEntry(entry, store.filterQuery);
			if (!matchResult.matches) {
				continue;
			}
			matchedEntries.push({
				entry,
				score: matchResult.score,
				indices: matchResult.indices,
			});
		} else {
			matchedEntries.push({ entry, score: 1, indices: [] });
		}
	}

	// Sort by fuzzy score first (when filtering), then by regular sort
	if (store.filterQuery) {
		// When filtering, sort by fuzzy score descending first
		matchedEntries.sort((a, b) => {
			// Directories still come first
			const aIsDir = a.entry.type === FileType.Directory;
			const bIsDir = b.entry.type === FileType.Directory;
			if (aIsDir && !bIsDir) return -1;
			if (!aIsDir && bIsDir) return 1;
			// Then by fuzzy score (higher score = better match)
			return b.score - a.score;
		});
	} else {
		// Normal sorting when not filtering
		const entries = matchedEntries.map((m) => m.entry);
		const sorted = fileStoreSortEntries(entries, config.sortField, config.sortDirection);
		matchedEntries.length = 0;
		for (const entry of sorted) {
			matchedEntries.push({ entry, score: 1, indices: [] });
		}
	}

	// Store display entries and match info
	store.displayEntries = matchedEntries.map((m) => m.entry);
	for (let i = 0; i < matchedEntries.length; i++) {
		const match = matchedEntries[i];
		if (match && match.indices.length > 0) {
			store.matchInfo.set(i, { score: match.score, indices: match.indices });
		}
	}
}

/**
 * Sorts entries by the specified field and direction.
 * Directories always come first.
 * Uses sortByName utility to properly sort hidden files (dot-prefixed) after regular files.
 */
function fileStoreSortEntries(
	entries: FileEntry[],
	field: SortField,
	direction: SortDirection,
): FileEntry[] {
	// First, separate directories and files
	const directories = entries.filter((e) => e.type === FileType.Directory);
	const files = entries.filter((e) => e.type !== FileType.Directory);

	// Sort each group
	const sortGroup = (group: FileEntry[]): FileEntry[] => {
		if (field === SortField.Name) {
			// Use sortByName for proper dot-prefix handling
			const sorted = sortByName(group);
			return direction === SortDirection.Descending ? sorted.reverse() : sorted;
		}

		const multiplier = direction === SortDirection.Ascending ? 1 : -1;
		return [...group].sort((a, b) => {
			switch (field) {
				case SortField.Size:
					return multiplier * (a.size - b.size);
				case SortField.Modified:
					return multiplier * (a.modified.getTime() - b.modified.getTime());
				case SortField.Type:
					return multiplier * a.extension.localeCompare(b.extension);
				default:
					return 0;
			}
		});
	};

	// Directories first, then files
	return [...sortGroup(directories), ...sortGroup(files)];
}
