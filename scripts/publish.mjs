// Build, then commit and push so the Pages workflow deploys.
//
//   npm run publish
//
// The build is the real gate: a bad image path or malformed frontmatter fails
// here, on this machine, rather than on the live site.

import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { TODO } from './lib/project.mjs';

const run = promisify(execFile);
const root = path.resolve(fileURLToPath(import.meta.url), '../..');
const CONTENT = path.join(root, 'src/content/projects');

/** Projects still carrying generated gaps. Publishing must not include them. */
export async function draftsWithTodos() {
  const files = (await readdir(CONTENT)).filter(f => f.endsWith('.md'));
  const drafts = [];
  for (const file of files) {
    const text = await readFile(path.join(CONTENT, file), 'utf8');
    if (text.includes(TODO)) drafts.push(file);
  }
  return drafts;
}

async function git(args) {
  const { stdout } = await run('git', args, { cwd: root });
  return stdout.trim();
}

export async function publish({ log = console.log } = {}) {
  const drafts = await draftsWithTodos();
  if (drafts.length) {
    return {
      published: false,
      reason: `still a draft: ${drafts.join(', ')}`,
      drafts,
    };
  }

  const status = await git(['status', '--porcelain']);
  if (!status) return { published: false, reason: 'nothing to publish' };

  log('Building…');
  try {
    await run('npm', ['run', 'build'], { cwd: root, shell: true, maxBuffer: 1024 * 1024 * 32 });
  } catch (error) {
    return {
      published: false,
      reason: 'the build failed, so nothing was pushed',
      detail: (error.stdout || error.message || '').slice(-2000),
    };
  }

  const changed = status
    .split('\n')
    .map(line => line.slice(3))
    .filter(f => f.startsWith('src/'));

  const projects = changed
    .filter(f => f.startsWith('src/content/projects/'))
    .map(f => path.basename(f, '.md'));

  const message = projects.length
    ? `Add ${projects.join(', ')}`
    : 'Update portfolio content';

  log('Publishing…');
  await git(['add', '-A', 'src']);
  await git(['commit', '-m', message]);

  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  await git(['push', 'origin', branch]);

  return { published: true, message, branch };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await publish();
  if (result.published) {
    console.log(`Pushed "${result.message}" to ${result.branch}.`);
    console.log('GitHub Actions will deploy it in a minute or two.');
  } else {
    console.log(`Nothing published — ${result.reason}.`);
    if (result.detail) console.log(`\n${result.detail}`);
    if (result.drafts) {
      console.log('\nFill in the TODO fields in those files, then run this again.');
    }
  }
  process.exit(result.published ? 0 : 1);
}
