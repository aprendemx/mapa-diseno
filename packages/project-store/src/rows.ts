/**
 * Row shapes, one per table in `schema.sql`, named as the database names them.
 *
 * Keeping snake_case here rather than translating at the type level makes the
 * boundary visible: anything holding these is talking to the database, and
 * anything holding a `Project` is talking to the domain.
 */

export interface StateRow {
  id: string;
  name: string;
  position: number;
}

export interface AppearanceRow {
  background_color: string;
  title_color: string;
  state_with_media_color: string;
  state_disabled_color: string;
  state_hover_color: string;
  state_selected_color: string;
  coverage_origin_color: string;
  coverage_area_color: string;
  glow_color: string;
  glow_intensity: number;
  glow_opacity: number;
  glow_core_size: number;
  glow_spread: number;
  glow_outline: number;
  accent_color: string;
}

export interface MediumRow {
  id: string;
  name: string;
  folder_slug: string;
  active: boolean;
  /** Null when unassigned — the absence of a state is not a state. */
  state_id: string | null;
  notes: string;
  coverage_text: string;
  social_enabled: boolean;
  position: number;
}

export interface CoverageStateRow {
  medium_id: string;
  state_id: string;
  position: number;
}

export interface MediaFileRow {
  id: string;
  medium_id: string;
  kind: 'imagen' | 'video' | 'audio';
  path: string;
  description: string;
  /** Shared ordering space with `social_themes` for the same medium. */
  witness_position: number;
}

export interface SocialThemeRow {
  id: string;
  medium_id: string;
  title: string;
  instagram: string;
  facebook: string;
  x: string;
  tiktok: string;
  youtube: string;
  witness_position: number;
}

/** Everything the catalogue is, as the database holds it. */
export interface CatalogRows {
  appearance: AppearanceRow;
  states: StateRow[];
  media: MediumRow[];
  coverageStates: CoverageStateRow[];
  files: MediaFileRow[];
  socialThemes: SocialThemeRow[];
}
