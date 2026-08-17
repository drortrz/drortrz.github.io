// Writing the asset folder.
//
// The gallery reads its order from the filenames, so the naming here is not
// cosmetic: cover.jpg, then 01.jpg, 02.jpg … in the order they should appear.

import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

/** Wider than any layout slot; anything larger is only download weight. */
const MAX_WIDTH = 2000;
/** Below this an "image" is a logo, a rule, or a scanning artefact. */
const MIN_WIDTH = 400;
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff']);

export function isImageFile(name) {
  return IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

/** Loose image files in a dropped folder, in filename order. */
export async function findLooseImages(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && isImageFile(e.name))
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(name => path.join(folder, name));
}

/**
 * Write images into src/assets/projects/<slug>/ as cover.jpg + 01.jpg…
 *
 * @param {Array<string|{data:Buffer,width:number,height:number,channels:number}>} sources
 *        file paths, or raw buffers as produced by pdf.js extraction
 * @returns {Promise<{cover:string, gallery:string[], skipped:number}>}
 */
export async function writeAssets(sources, destination) {
  await mkdir(destination, { recursive: true });

  const written = [];
  let skipped = 0;

  for (const source of sources) {
    const pipeline = await toPipeline(source);
    if (!pipeline) {
      skipped++;
      continue;
    }

    const meta = await pipeline.metadata();
    if (!meta.width || meta.width < MIN_WIDTH) {
      skipped++; // artefact, not a photograph
      continue;
    }

    // cover first, then the sequence the gallery reads in order.
    const name =
      written.length === 0 ? 'cover.jpg' : `${String(written.length).padStart(2, '0')}.jpg`;

    const buffer = await pipeline
      .resize({ width: Math.min(meta.width, MAX_WIDTH), withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();

    await writeFile(path.join(destination, name), buffer);
    written.push(name);
  }

  if (!written.length) return { cover: null, gallery: [], skipped };
  return { cover: written[0], gallery: written.slice(1), skipped };
}

async function toPipeline(source) {
  try {
    if (typeof source === 'string') return sharp(source);
    return sharp(source.data, {
      raw: { width: source.width, height: source.height, channels: source.channels },
    });
  } catch {
    return null;
  }
}
