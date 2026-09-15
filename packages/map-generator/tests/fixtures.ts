import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Project } from '../src/domain/project.ts';
import type { MapData } from '../src/domain/map-data.ts';

const here = dirname(fileURLToPath(import.meta.url));

const read = (name: string): unknown =>
  JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'));

/** Input the legacy pipeline was last run against. */
export const project = read('project.json') as Project;

/** Output that same run produced, lifted out of the published map. */
export const expectedMapData = read('expected-map-data.json') as MapData;
