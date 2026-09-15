import type { Project } from '@mapa-mexico/map-generator';

import type { Problem } from './validation.ts';

/**
 * What must hold before the map is published.
 *
 * These are the checks the legacy generator ran, with one change that matters:
 * it ran them *after* it had already written the JSON, moved the files and
 * deleted the orphans, so a failure left the disk changed and the published map
 * stale. Here nothing is touched until every one of them passes.
 *
 * Deliberately separate from `validateMedium`, which guards a single form.
 * These are catalogue-wide invariants: they can be broken by a change made
 * somewhere else entirely, so they are checked at the moment of publishing and
 * not before.
 */

export const REQUIRED_STATE_COUNT = 32;

/** Answers whether a stored path still resolves to bytes on disk. */
export type FileExists = (relativePath: string) => boolean | Promise<boolean>;

export async function checkPublishable(
  project: Project,
  fileExists: FileExists,
): Promise<Problem[]> {
  const problems: Problem[] = [];

  if (project.states.length !== REQUIRED_STATE_COUNT) {
    problems.push({
      field: 'states',
      message: `El catálogo debe conservar exactamente los ${REQUIRED_STATE_COUNT} estados; hay ${project.states.length}.`,
    });
  }

  const stateIds = new Set<string>();
  for (const state of project.states) {
    if (stateIds.has(state.id)) {
      problems.push({ field: 'states', message: `Estado repetido: ${state.id}.` });
    }
    stateIds.add(state.id);
  }

  const mediumIds = new Set<string>();
  for (const medium of project.media) {
    const label = medium.name?.trim() || medium.id || '(sin nombre)';

    if (!medium.id?.trim() || !medium.name?.trim()) {
      problems.push({ field: 'media', message: 'Hay un medio sin nombre.' });
    } else if (mediumIds.has(medium.id)) {
      problems.push({ field: 'media', message: `Identificador repetido: ${medium.id}.` });
    }
    mediumIds.add(medium.id);

    if (medium.stateId && !stateIds.has(medium.stateId)) {
      problems.push({ field: 'media', message: `Estado inválido en ${label}: ${medium.stateId}.` });
    }

    for (const coverageState of medium.coverageStates ?? []) {
      if (coverageState && !stateIds.has(coverageState)) {
        problems.push({
          field: 'coverage',
          message: `Estado de cobertura inválido en ${label}: ${coverageState}.`,
        });
      }
    }

    // The check that actually catches things. A path can stop resolving
    // because a file was swept, restored from a partial backup, or moved by
    // hand — and a published map whose videos 404 looks fine until someone
    // clicks.
    for (const file of medium.files ?? []) {
      if (!file.file?.trim()) continue;
      if (!(await fileExists(file.file))) {
        problems.push({ field: 'files', message: `No se encontró: ${file.file}` });
      }
    }
  }

  return problems;
}
