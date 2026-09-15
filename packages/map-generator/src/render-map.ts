import type { MapData } from './domain/map-data.ts';

/**
 * Renders the published map: the template with the catalogue baked into it.
 *
 * The data goes in as a literal rather than being fetched at runtime, which
 * keeps the published file self-contained and keeps `mapa-base.html` — 117 KB
 * of working SVG and behaviour — untouched by this migration.
 */

const MARKERS =
  /\/\*__DATOS_GENERADOS_INICIO__\*\/[\s\S]*?\/\*__DATOS_GENERADOS_FIN__\*\//;

const CLOSING_BODY = /<\/body>/i;

export const MEDIA_STOP_ID = 'control-cierre-multimedia';

export class TemplateError extends Error {}

/**
 * Injects the data block.
 *
 * The replacement is a function, not a string. `String.prototype.replace`
 * expands `$&`, `$1`, `$'` inside a string replacement, and this payload is
 * arbitrary JSON full of URLs — one `$&` in a Facebook link would corrupt the
 * published map silently. The PowerShell generator used a MatchEvaluator for
 * exactly this reason.
 */
function injectData(template: string, data: MapData): string {
  if (!MARKERS.test(template)) {
    throw new TemplateError(
      'La plantilla no tiene los marcadores /*__DATOS_GENERADOS_INICIO__*/ … FIN.',
    );
  }

  const block =
    '/*__DATOS_GENERADOS_INICIO__*/\r\n' +
    `const PROJECT_DATA=${JSON.stringify(data)};\r\n` +
    '/*__DATOS_GENERADOS_FIN__*/';

  return template.replace(MARKERS, () => block);
}

/**
 * Appends the script that stops hidden audio and video.
 *
 * Idempotent by id: re-rendering an already-rendered page must not stack two
 * copies of it, which is what makes it safe to treat a published file as a
 * template in a pinch.
 */
function injectMediaStop(html: string, mediaStop: string): string {
  if (html.includes(`id="${MEDIA_STOP_ID}"`)) return html;

  if (CLOSING_BODY.test(html)) {
    return html.replace(CLOSING_BODY, () => `${mediaStop}\r\n</body>`);
  }
  return `${html}\r\n${mediaStop}`;
}

export interface RenderInput {
  /** `mapa-base.html`, verbatim. */
  template: string;
  /** The `<script id="control-cierre-multimedia">` block. */
  mediaStop: string;
  data: MapData;
}

export function renderMap({ template, mediaStop, data }: RenderInput): string {
  return injectMediaStop(injectData(template, data), mediaStop.trim());
}
