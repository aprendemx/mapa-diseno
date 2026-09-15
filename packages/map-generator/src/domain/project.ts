/**
 * Source model: the shape stored in `datos/proyecto.json`.
 *
 * This is the editable model. It is nested and authoring-oriented: a medium
 * owns its files, its social themes and a single unified display order.
 */

export interface Appearance {
  backgroundColor: string;
  titleColor: string;
  stateWithMediaColor: string;
  stateDisabledColor: string;
  stateHoverColor: string;
  stateSelectedColor: string;
  coverageOriginColor: string;
  coverageAreaColor: string;
  glowColor: string;
  glowIntensity: number;
  glowOpacity: number;
  glowCoreSize: number;
  glowSpread: number;
  glowOutline: number;
  accentColor: string;
}

export interface State {
  id: string;
  name: string;
}

export type FileKind = 'imagen' | 'video' | 'audio';

export interface MediaFile {
  id: string;
  type: FileKind;
  /** Path relative to the project root, always with forward slashes. */
  file: string;
  description: string;
}

/** Fixed key set, always these five, always in this order. */
export interface SocialLinks {
  instagram: string;
  facebook: string;
  x: string;
  tiktok: string;
  youtube: string;
}

export interface SocialTheme {
  id: string;
  title: string;
  links: SocialLinks;
}

export interface Medium {
  /** Frozen once the medium has files. Renaming does not change it. */
  id: string;
  /** May contain `[[...]]` markers the map renders as emphasised place names. */
  name: string;
  /** Derived from `name`; informative only — the real path lives in `files[].file`. */
  folderSlug: string;
  active: boolean;
  /** Empty string means unassigned. */
  stateId: string;
  /** Multiline. One campaign per non-blank line. */
  notes: string;
  coverageText: string;
  /** Additional states reached. Never includes `stateId`. */
  coverageStates: string[];
  files: MediaFile[];
  socialEnabled: boolean;
  socialThemes: SocialTheme[];
  /** Unified display order mixing `files[].id` and `socialThemes[].id`. */
  witnessOrder: string[];
}

export interface Project {
  version: number;
  appearance: Appearance;
  /** Exactly 32, immutable by design. */
  states: State[];
  media: Medium[];
}
