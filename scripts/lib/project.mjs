// Composing the project markdown.
//
// The output has to match the shape of the eight hand-written files exactly —
// see src/content/projects/cebatero.md — because that shape is what the layout
// consumes. Anything the PDF cannot supply is written as a TODO, which is also
// what holds the page back from publishing.

/** Every generated gap carries this token; the publish gate greps for it. */
export const TODO = 'TODO';

export function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Double-quoted YAML scalar. */
function yaml(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function yamlList(values) {
  return `[${values.map(yaml).join(', ')}]`;
}

/**
 * Turn the PDF's page texts into a description and a body.
 *
 * The heuristics are deliberately shallow. A PDF gives no structure to lean on,
 * so anything cleverer would be guessing with more confidence than it earns —
 * better to hand over readable prose and let it be corrected.
 */
export function readProse(pages) {
  const lines = pages
    .join('\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    // Page numbers, running heads and stray glyphs.
    .filter(line => line.length > 2 && !/^\d+$/.test(line));

  // Rebuild paragraphs: a line that ends mid-sentence continues the one below.
  const paragraphs = [];
  let current = '';
  for (const line of lines) {
    current = current ? `${current} ${line}` : line;
    if (/[.!?]["')\]]?$/.test(line)) {
      paragraphs.push(current);
      current = '';
    }
  }
  if (current) paragraphs.push(current);

  const prose = paragraphs.filter(p => p.split(' ').length >= 8);
  const first = prose[0] ?? '';
  const sentence = first.match(/^(.+?[.!?])(\s|$)/);

  return {
    description: sentence ? sentence[1].trim() : first.trim(),
    body: prose.join('\n\n'),
  };
}

/** A four-digit year anywhere in the text is the best date signal a PDF gives. */
export function readYear(pages) {
  const years = [...pages.join(' ').matchAll(/\b(20[2-3]\d)\b/g)].map(m => Number(m[1]));
  if (!years.length) return null;
  // The latest plausible year: portfolios cite earlier work in passing.
  return Math.max(...years);
}

/**
 * @returns {{markdown: string, todos: string[]}}
 */
export function composeProject({ title, slug, cover, gallery, description, body, year }) {
  const todos = [];
  const note = label => {
    todos.push(label);
    return `${TODO}: ${label}`;
  };

  const assetPath = file => `../../assets/projects/${slug}/${file}`;

  const date = year ? `${year}-01-01` : new Date().toISOString().slice(0, 10);
  const dateComment = year ? '' : ` # ${note('no year found in the PDF — set the real date')}`;

  const lines = [];
  lines.push('---');
  lines.push(`title: ${yaml(title)}`);
  lines.push(
    `description: ${yaml(description || `${TODO}: one sentence describing the project`)}`
  );
  if (!description) todos.push('description');
  lines.push(`date: ${date}${dateComment}`);
  lines.push(`tags: ${yamlList([`${TODO}: add tags`])}`);
  todos.push('tags');
  lines.push(`role: ${yaml(`${TODO}: your role`)}`);
  todos.push('role');
  lines.push(`tools: ${yamlList([`${TODO}: add tools`])}`);
  todos.push('tools');
  lines.push(`cover: ${yaml(assetPath(cover))}`);

  if (gallery.length) {
    lines.push('gallery:');
    for (const file of gallery) {
      lines.push(`  - src: ${yaml(assetPath(file))}`);
      lines.push(`    alt: ${yaml(`${TODO}: describe this image`)}`);
    }
    todos.push(`alt text for ${gallery.length} image${gallery.length === 1 ? '' : 's'}`);
  }

  lines.push('featured: false');
  lines.push(
    `order: 9 # ${note('confirm the group — B.Des 1–6, Erasmus+ 7, Ferrero 8, HAKOL 9+')}`
  );
  lines.push('---');
  lines.push('');
  lines.push('## Overview');
  lines.push('');
  lines.push(body || `${TODO}: write the overview.`);
  if (!body) todos.push('body');
  lines.push('');

  return { markdown: lines.join('\n'), todos };
}

/** Does a written project still have gaps? This is the publish gate. */
export function hasTodos(markdown) {
  return markdown.includes(TODO);
}
