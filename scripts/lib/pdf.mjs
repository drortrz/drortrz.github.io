// Pulling text and images out of a PDF.
//
// pdfjs hands back positioned glyph runs, not paragraphs — a PDF has no idea
// what a sentence is. Everything here is the work of rebuilding lines from
// coordinates and then guessing where the paragraph breaks were.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** pdfjs ships as an ESM build that wants a DOM; this is the Node entry. */
async function loadPdfjs() {
  return import('pdfjs-dist/legacy/build/pdf.mjs');
}

/**
 * Read text and images in one pass.
 *
 * Deliberately one document for both: pdfjs runs on a shared worker in Node,
 * and destroying one loading task leaves the next one unable to transfer image
 * data back. Opening the file twice fails with "Cannot transfer object of
 * unsupported type" on whichever read comes second.
 *
 * @returns {Promise<{pages: string[], images: Array<object>}>}
 */
export async function readPdf(bytes, { wantImages = true } = {}) {
  const pdfjs = await loadPdfjs();
  // destroy() belongs to the loading task, not the document proxy.
  const task = pdfjs.getDocument({ data: bytes, useSystemFonts: true, isEvalSupported: false });
  const doc = await task.promise;

  try {
    const pages = await readText(doc);
    const images = wantImages ? await readImages(pdfjs, doc) : [];
    return { pages, images };
  } finally {
    await task.destroy();
  }
}

/** One string per page, lines rebuilt from glyph positions. */
async function readText(doc) {
  const pages = [];

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();

    // Group runs into lines by their baseline y. The tolerance has to be a
    // little loose: superscripts and mixed font sizes shift the baseline by a
    // point or two without starting a new line.
    const lines = [];
    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      // pdfjs measures each run for us, which is what makes the column gap
      // below measurable rather than guessed.
      const part = { x, str: item.str, width: item.width ?? item.str.length * 4 };
      const line = lines.find(l => Math.abs(l.y - y) < 3);
      if (line) line.parts.push(part);
      else lines.push({ y, parts: [part] });
    }

    // A wide horizontal gap on one baseline means two columns, not one
    // sentence. Splitting there stops a paragraph in the left column being
    // spliced into the middle of a sentence in the right one.
    const { width } = page.getViewport({ scale: 1 });
    const columnGap = width * 0.15;

    const text = lines
      // PDF y grows upwards, so the top of the page is the largest y.
      .sort((a, b) => b.y - a.y)
      .flatMap(line => {
        const parts = line.parts.sort((a, b) => a.x - b.x);
        const segments = [];
        let current = '';
        let previousEnd = null;

        for (const part of parts) {
          if (previousEnd !== null && part.x - previousEnd > columnGap) {
            segments.push(current);
            current = '';
          }
          current += part.str;
          previousEnd = part.x + part.width;
        }
        segments.push(current);

        return segments.map(s => s.replace(/\s+/g, ' ').trim());
      })
      .filter(Boolean)
      .join('\n');

    pages.push(text);
  }

  return pages;
}

/**
 * Every embedded raster image, largest first.
 *
 * Deliberately reads the operator list rather than rendering pages: rendering
 * would return the designed spread, complete with its background and captions,
 * where what the gallery wants is the photograph on its own.
 */
async function readImages(pdfjs, doc) {
  const found = [];
  const seen = new Set();

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    let ops;
    try {
      ops = await page.getOperatorList();
    } catch {
      continue; // a page that will not parse should not sink the whole PDF
    }

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      if (fn !== pdfjs.OPS.paintImageXObject && fn !== pdfjs.OPS.paintJpegXObject) {
        continue;
      }

      const name = ops.argsArray[i][0];
      if (typeof name !== 'string' || seen.has(name)) continue;
      seen.add(name);

      let img;
      try {
        img = await readObject(page, name);
      } catch {
        continue; // one unreadable image must not sink the whole PDF
      }
      if (!img || !img.width || !img.height) continue;

      const raw = toRgb(img);
      if (raw) found.push({ ...raw, width: img.width, height: img.height });
    }
  }

  // Biggest first: the hero shot is almost always the largest thing in a
  // spread, and it becomes the cover.
  return found.sort((a, b) => b.width * b.height - a.width * a.height);
}

/** The image store is populated asynchronously during page parsing. */
function readObject(page, name) {
  return new Promise(resolve => {
    let settled = false;
    const done = value => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    try {
      const direct = page.objs.get(name, done);
      if (direct) done(direct);
    } catch {
      done(null);
    }

    // objs.get never calls back for an object the page does not own.
    setTimeout(() => done(null), 3000);
  });
}

/**
 * pdfjs returns RGBA, RGB or greyscale depending on the source. Normalise to
 * something sharp can take without guessing.
 */
function toRgb(img) {
  const { width, height, data } = img;
  if (!data || !data.length) return null;

  const pixels = width * height;
  const channels = Math.round(data.length / pixels);

  if (channels === 3 || channels === 4) {
    return { data: Buffer.from(data), channels };
  }

  if (channels === 1) {
    // Greyscale — expand so every image reaching sharp has the same shape.
    const out = Buffer.alloc(pixels * 3);
    for (let i = 0; i < pixels; i++) {
      out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = data[i];
    }
    return { data: out, channels: 3 };
  }

  return null;
}
