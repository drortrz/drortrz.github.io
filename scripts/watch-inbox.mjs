// Watch _inbox/ and turn what lands there into published pages.
//
//   npm run watch
//
// Polls rather than using fs.watch: the repo lives inside OneDrive, where
// change events are unreliable and files arrive gradually. A folder is only
// touched once its fingerprint — file count, total bytes, newest mtime — has
// been unchanged for a while, so a half-synced copy is never ingested.
//
// Publishing happens on its own, but only for a page with no TODO left in it.
// Fill those in and the next sweep pushes it.

import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pending, ingestAll, INBOX } from './ingest.mjs';
import { publish, draftsWithTodos } from './publish.mjs';

const POLL_MS = 5000;
const SETTLE_MS = 30000;

const fingerprints = new Map();

/** Recursive count/bytes/mtime — enough to notice any copy still in progress. */
async function fingerprint(folder) {
  let files = 0;
  let bytes = 0;
  let newest = 0;

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        const info = await stat(full);
        files++;
        bytes += info.size;
        newest = Math.max(newest, info.mtimeMs);
      }
    }
  }

  await walk(folder);
  return `${files}:${bytes}:${newest}`;
}

/** Folders that have stopped changing. */
async function settled() {
  const ready = [];
  const folders = await pending();
  const live = new Set(folders);

  for (const key of fingerprints.keys()) {
    if (!live.has(key)) fingerprints.delete(key);
  }

  for (const folder of folders) {
    let current;
    try {
      current = await fingerprint(folder);
    } catch {
      continue; // mid-copy; look again next sweep
    }

    const previous = fingerprints.get(folder);
    if (!previous || previous.value !== current) {
      fingerprints.set(folder, { value: current, since: Date.now() });
      continue;
    }

    if (Date.now() - previous.since >= SETTLE_MS) ready.push(folder);
  }

  return ready;
}

const stamp = () => new Date().toTimeString().slice(0, 8);
const log = message => console.log(`[${stamp()}] ${message}`);

let working = false;
let lastDrafts = '';

async function sweep() {
  if (working) return;
  working = true;

  try {
    const ready = await settled();

    if (ready.length) {
      log(`${ready.length} folder(s) settled — ingesting.`);
      for (const folder of ready) fingerprints.delete(folder);
      await ingestAll({ log: message => console.log(message) });
    }

    // Publish whenever the content is complete — which may be now, or may be
    // three days later when the alt text finally gets written.
    const drafts = await draftsWithTodos();
    if (drafts.length) {
      const key = drafts.join(',');
      if (key !== lastDrafts) {
        log(`waiting on TODO fields in: ${drafts.join(', ')}`);
        lastDrafts = key;
      }
      return;
    }
    lastDrafts = '';

    const result = await publish({ log });
    if (result.published) {
      log(`published "${result.message}" to ${result.branch}.`);
    } else if (result.reason !== 'nothing to publish') {
      log(`not published — ${result.reason}.`);
      if (result.detail) console.log(result.detail);
    }
  } catch (error) {
    log(`sweep failed: ${error.message}`);
  } finally {
    working = false;
  }
}

log(`watching ${INBOX}`);
log(`drop a folder in; it is picked up ${SETTLE_MS / 1000}s after it stops changing.`);
await sweep();
setInterval(sweep, POLL_MS);
