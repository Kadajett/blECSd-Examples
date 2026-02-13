/**
 * Custom Kitty graphics protocol renderer.
 *
 * Bypasses blECSd's standard backend to use Kitty animation mode
 * (`a=f` + `a=a`) with RGB24 output for maximum throughput.
 * This avoids full image retransmission each frame and saves 25%
 * bandwidth by dropping the alpha channel.
 *
 * @module render/kittyProtocol
 */

import { type three, writeRaw } from 'blecsd';

// ─── Constants ──────────────────────────────────────────────────

const CHUNK_SIZE = 4096;

// ─── Types ──────────────────────────────────────────────────────

export interface KittyRenderer {
	renderFrame(fb: three.PixelFramebuffer): void;
	cleanup(): void;
}

// ─── Implementation ─────────────────────────────────────────────

/**
 * Create a Kitty protocol renderer that uses animation mode
 * for efficient frame updates.
 *
 * First frame: transmit + display (`a=T`)
 * Subsequent frames: upload frame (`a=f`) then animate (`a=a`)
 *
 * @param imageId - Kitty image ID to use
 * @param width - Framebuffer width in pixels
 * @param height - Framebuffer height in pixels
 */
export function createKittyRenderer(
	imageId: number,
	width: number,
	height: number,
): KittyRenderer {
	let firstFrame = true;
	const rgb24 = new Uint8Array(width * height * 3);

	return {
		renderFrame(fb: three.PixelFramebuffer): void {
			// Convert RGBA to RGB24
			const rgba = fb.colorBuffer;
			const totalPixels = width * height;
			let rgbOff = 0;
			let rgbaOff = 0;
			for (let i = 0; i < totalPixels; i++) {
				rgb24[rgbOff] = rgba[rgbaOff] ?? 0;
				rgb24[rgbOff + 1] = rgba[rgbaOff + 1] ?? 0;
				rgb24[rgbOff + 2] = rgba[rgbaOff + 2] ?? 0;
				rgbOff += 3;
				rgbaOff += 4;
			}

			// Base64 encode the RGB24 buffer
			const b64 = Buffer.from(rgb24.buffer, rgb24.byteOffset, rgb24.byteLength).toString('base64');

			// Build the output string
			let output = '\x1b[1;1H';

			if (firstFrame) {
				// Transmit and display: a=T, f=24 (RGB), suppress response with q=2
				output += buildChunkedPayload(
					b64,
					`a=T,f=24,s=${width},v=${height},i=${imageId},q=2`,
				);
				firstFrame = false;
			} else {
				// Upload new frame: a=f, r=1 replaces previous frame data
				output += buildChunkedPayload(
					b64,
					`a=f,r=1,i=${imageId},f=24,s=${width},v=${height},q=2`,
				);
				// Animate (display the uploaded frame)
				output += `\x1b_Ga=a,i=${imageId},q=2\x1b\\`;
			}

			// TODO: blECSd missing kitty image protocol API - using writeRaw
			writeRaw(output);
		},

		cleanup(): void {
			// Delete image and suppress response
			// TODO: blECSd missing kitty image protocol API - using writeRaw
			writeRaw(`\x1b_Ga=d,d=I,i=${imageId},q=2\x1b\\`);
		},
	};
}

/**
 * Build a chunked Kitty graphics protocol payload.
 *
 * Splits base64 data into CHUNK_SIZE pieces, using m=1 for
 * continuation chunks and m=0 for the final chunk.
 */
function buildChunkedPayload(b64Data: string, header: string): string {
	const parts: string[] = [];
	let offset = 0;
	const total = b64Data.length;

	if (total <= CHUNK_SIZE) {
		// Single chunk, no continuation needed
		parts.push(`\x1b_G${header},m=0;${b64Data}\x1b\\`);
	} else {
		// First chunk with header and m=1
		parts.push(`\x1b_G${header},m=1;${b64Data.slice(0, CHUNK_SIZE)}\x1b\\`);
		offset = CHUNK_SIZE;

		// Middle chunks (no header fields needed, just continuation)
		while (offset + CHUNK_SIZE < total) {
			parts.push(`\x1b_Gm=1;${b64Data.slice(offset, offset + CHUNK_SIZE)}\x1b\\`);
			offset += CHUNK_SIZE;
		}

		// Final chunk with m=0
		parts.push(`\x1b_Gm=0;${b64Data.slice(offset)}\x1b\\`);
	}

	return parts.join('');
}
