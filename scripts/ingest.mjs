// Turn every folder waiting in _inbox/ into a project page.
//
//   npm run ingest
//
// A folder is a project: its name becomes the title and the slug, its PDF
// supplies the prose, and its images — loose files if there are any, otherwise
// the ones embedded in the PDF — become the gallery.
//
// Nothing here publishes. A folder that cannot be read is moved aside with a
// report rather than half-written into the site.

import { readdir, readFile, mkdir, writeFile, rename, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPdf } from './lib/pdf.mjs';
import { findLooseImages, writeAssets, isImageFile } from './lib/images.mjs';
import { slugify, readProse, readYear, composeProject } from './lib/project.mjs';

const root = path.resolve(fileURLToPath(import.meta.url), '../..');
export const INBOX = path.resolve(root, '../_inbox');
const DONE = path.join(INBOX, '_done');
const ATTENTION = path.join(INBOX, '_needs-attention');
const CONTENT = path.join(root, 'src/content/projects');
const ASSETS = path.join(root, 'src/assets/projects');

const RESERVED = new Set(['_done', '_needs-attention']);

/** Folders waiting to be processed. */
export async function pending() {
  try {
    const entries = await readdir(INBOX, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !RESERVED.has(e.name))
      .map(e => path.join(INBOX, e.name));
  } catch {
    return []; // no inbox yet
  }
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/** Move a folder aside, keeping the name unique. */
async function park(folder, destination, report) {
  await mkdir(destination, { recursive: true });
  let target = path.join(destination, path.basename(folder));
  if (await exists(target)) target = `${target} ${Date.now()}`;
  await rename(folder, target);
  if (report) await writeFile(path.join(target, 'report.txt'), report, 'utf8');
  return target;
}

/**
 * @returns {Promise<{slug:string, file:string, todos:string[]}>}
 * @throws when the folder cannot produce a page
 */
export async function ingestFolder(folder) {
  const name = path.basename(folder);
  const slug = slugify(name);
  if (!slug) throw new Error(`"${name}" does not produce a usable slug.`);

  if (await exists(path.join(CONTENT, `${slug}.md`))) {
    throw new Error(
      `A project called "${slug}" already exists. Rename the folder, or edit ` +
        `src/content/projects/${slug}.md directly.`
    );
  }

  const entries = await readdir(folder, { withFileTypes: true });
  const pdfName = entries.find(e => e.isFile() && e.name.toLowerCase().endsWith('.pdf'))?.name;

  // Loose images win: if they took the trouble to drop real files, those are
  // better than anything extracted from a PDF.
  let sources = await findLooseImages(folder);
  let pages = [];

  if (pdfName) {
    const bytes = new Uint8Array(await readFile(path.join(folder, pdfName)));
    let read;
    try {
      // Only ask for images when there are no loose files to prefer — it is
      // by far the slowest part of reading a PDF.
      read = await readPdf(bytes, { wantImages: sources.length === 0 });
    } catch (error) {
      throw new Error(`The PDF could not be read: ${error.message}`);
    }
    pages = read.pages;
    if (!sources.length) sources = read.images;
  } else if (!sources.length) {
    throw new Error('The folder holds neither a PDF nor any images.');
  }

  if (!sources.length) {
    throw new Error(
      'No usable images. Drop the photographs into the folder alongside the PDF ' +
        'and it will use those instead.'
    );
  }

  const destination = path.join(ASSETS, slug);
  const { cover, gallery, skipped } = await writeAssets(sources, destination);

  if (!cover) {
    await rm(destination, { recursive: true, force: true });
    throw new Error(
      `Every image was too small to use (${skipped} skipped, minimum width 400px).`
    );
  }

  const { description, body } = readProse(pages);
  const { markdown, todos } = composeProject({
    title: name.trim(),
    slug,
    cover,
    gallery,
    description,
    body,
    year: readYear(pages),
  });

  const file = path.join(CONTENT, `${slug}.md`);
  await writeFile(file, markdown, 'utf8');

  return { slug, file, todos, images: gallery.length + 1, skipped };
}

/** Process everything waiting. Returns what happened, for the watcher to act on. */
export async function ingestAll({ log = console.log } = {}) {
  const folders = await pending();
  const results = [];

  for (const folder of folders) {
    const name = path.basename(folder);
    try {
      const result = await ingestFolder(folder);
      await park(folder, DONE, null);
      log(`  ✓ ${name} → src/content/projects/${result.slug}.md`);
      log(`    ${result.images} image(s) written${result.skipped ? `, ${result.skipped} skipped` : ''}`);
      if (result.todos.length) {
        log(`    still needs: ${result.todos.join(', ')}`);
      }
      results.push({ ok: true, ...result });
    } catch (error) {
      const report =
        `${name} could not be turned into a project page.\n\n` +
        `${error.message}\n\n` +
        `Fix the folder and move it back into _inbox/ to try again.\n`;
      await park(folder, ATTENTION, report);
      log(`  ✗ ${name} — ${error.message}`);
      log(`    moved to _inbox/_needs-attention/`);
      results.push({ ok: false, name, error: error.message });
    }
  }

  return results;
}

// Run directly rather than imported by the watcher.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const folders = await pending();
  if (!folders.length) {
    console.log('Nothing waiting in _inbox/.');
    process.exit(0);
  }

  console.log(`Ingesting ${folders.length} folder(s):`);
  const results = await ingestAll();
  const failed = results.filter(r => !r.ok).length;
  const needing = results.filter(r => r.ok && r.todos.length).length;

  console.log('');
  if (needing) {
    console.log(
      `${needing} page(s) have TODO fields left. Fill them in, then run \`npm run publish\`.`
    );
  }
  process.exit(failed ? 1 : 0);
}
