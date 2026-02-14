/**
 * Unicode file icons.
 * @module ui/icons
 */

import type { FileCategory } from '../data';

/**
 * Single-width Unicode icons for file types.
 *
 * IMPORTANT: All icons MUST be single-width (1 terminal column) characters.
 * Double-width characters (emoji) break CellBuffer column alignment because
 * the buffer treats each cell as 1 column but the terminal renders wide chars
 * as 2 columns, shifting all subsequent content right.
 */
export const FILE_ICONS: Record<FileCategory | 'selected' | 'cursor', string> = {
	directory: '▸',
	file: '·',
	symlink: '→',
	executable: '★',
	image: '◇',
	audio: '♪',
	video: '▷',
	archive: '◆',
	code: '#',
	text: '≡',
	document: '□',
	selected: '✓',
	cursor: '>',
};

/**
 * Fallback ASCII icons for terminals without Unicode support.
 */
export const ASCII_ICONS: Record<FileCategory | 'selected' | 'cursor', string> = {
	directory: 'D',
	file: '-',
	symlink: 'L',
	executable: '*',
	image: 'I',
	audio: 'A',
	video: 'V',
	archive: 'Z',
	code: '#',
	text: 'T',
	document: 'P',
	selected: '+',
	cursor: '>',
};

/**
 * Gets the icon for a file category.
 */
export function getIcon(category: FileCategory, useUnicode = true): string {
	const icons = useUnicode ? FILE_ICONS : ASCII_ICONS;
	return icons[category] ?? icons.file;
}
