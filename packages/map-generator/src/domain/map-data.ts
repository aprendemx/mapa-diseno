/**
 * Target model: the value assigned to `PROJECT_DATA` inside the published map.
 *
 * This is the read model. It is flat and lookup-oriented: six parallel tables
 * the map's runtime joins by id. Booleans are emitted as the strings '1'/'0',
 * which is the existing contract with `mapa-base.html` — not a style choice.
 */

import type { Appearance, FileKind, SocialLinks } from './project.ts';

export type Flag = '1' | '0';

export interface MapState {
  id: string;
  name: string;
  /** '1' when at least one *active* medium has this state as its origin. */
  active: Flag;
}

export interface MapMedium {
  id: string;
  name: string;
  stateId: string;
  coverageStates: string[];
  coverageText: string;
  socialEnabled: boolean;
  active: Flag;
  /** 1-based position in the authored media list. */
  order: number;
}

export interface MapCoverage {
  stateId: string;
  mediumId: string;
  order: number;
  active: Flag;
}

export interface MapCampaign {
  /** `<mediumId>-nota-<n>`, n being 1-based over non-blank note lines. */
  id: string;
  stateId: string;
  mediumId: string;
  name: string;
  active: Flag;
  order: number;
}

export interface MapFileContent {
  id: string;
  stateId: string;
  mediumId: string;
  type: FileKind;
  file: string;
  description: string;
  active: Flag;
  order: number;
}

export interface MapSocialContent {
  id: string;
  stateId: string;
  mediumId: string;
  type: 'social';
  theme: string;
  links: SocialLinks;
  active: Flag;
  order: number;
}

export type MapContent = MapFileContent | MapSocialContent;

export interface MapData {
  appearance: Appearance;
  states: MapState[];
  media: MapMedium[];
  coverage: MapCoverage[];
  campaigns: MapCampaign[];
  contents: MapContent[];
}
