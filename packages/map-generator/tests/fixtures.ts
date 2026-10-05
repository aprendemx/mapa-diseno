import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Project } from '../src/domain/project.ts';
import type { MapData } from '../src/domain/map-data.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, 'fixtures');

export interface Dataset {
  /** The delivery it came from, as a year-month. */
  name: string;
  /** What the editor held. */
  project: Project;
  /** What the legacy generator produced from it. */
  expectedMapData: MapData;
  /** The page that was actually served. */
  publishedHtml: string;
}

function load(name: string): Dataset {
  const read = (file: string) => readFileSync(join(root, name, file), 'utf8');
  return {
    name,
    project: JSON.parse(read('project.json')) as Project,
    expectedMapData: JSON.parse(read('expected-map-data.json')) as MapData,
    publishedHtml: read('published.html'),
  };
}

/** The delivery the port was built against. */
export const august = load('2026-08');

/**
 * A later delivery, held out.
 *
 * The generator reproduced it exactly without ever having been written against
 * it, which is what makes it evidence rather than a restatement. It also walks
 * three branches August never did: inactive media, media with empty notes and
 * media with no files.
 */
export const october = load('2026-10');

/** Every reference, for the checks that should hold on all of them. */
export const datasets: readonly Dataset[] = [august, october];
