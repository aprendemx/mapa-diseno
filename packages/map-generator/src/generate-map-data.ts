import type { Project } from './domain/project.ts';
import type { MapData } from './domain/map-data.ts';

/**
 * Projects the authoring model onto the six flat tables the published map
 * consumes.
 *
 * Phase 1 implements this. The contract it must satisfy is not a
 * specification written from reading the old script — it is the byte-level
 * output the PowerShell pipeline actually produced in production, frozen in
 * `tests/fixtures/expected-map-data.json`.
 */
export function generateMapData(_project: Project): MapData {
  throw new Error(
    'generateMapData is not implemented yet (phase 1). ' +
      'The golden test in tests/golden.test.ts is its acceptance criterion.',
  );
}
