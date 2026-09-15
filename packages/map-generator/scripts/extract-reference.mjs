// Extrae la referencia golden desde el artefacto que produjo el pipeline
// PowerShell. Es la unica fuente de verdad sobre que debe emitir el
// generador nuevo: salida real, verificada en produccion, no una hipotesis.
//
//   node scripts/extract-reference.mjs
//
// Entrada:  <raiz>/datos/proyecto.json        y  <raiz>/entrega/ABRIR MAPA.html
// Salida:   tests/fixtures/project.json       y  tests/fixtures/expected-map-data.json

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, '..');
const root = join(pkg, '..', '..');

const MARKERS = /\/\*__DATOS_GENERADOS_INICIO__\*\/(.*?)\/\*__DATOS_GENERADOS_FIN__\*\//s;

const html = readFileSync(join(root, 'entrega', 'ABRIR MAPA.html'), 'utf8');
const block = html.match(MARKERS);
if (!block) throw new Error('No se encontraron los marcadores de datos generados.');

const assignment = block[1].match(/const\s+PROJECT_DATA\s*=\s*(\{.*\})\s*;/s);
if (!assignment) throw new Error('No se encontro la asignacion de PROJECT_DATA.');

const mapData = JSON.parse(assignment[1]);
const project = JSON.parse(readFileSync(join(root, 'datos', 'proyecto.json'), 'utf8'));

const fixtures = join(pkg, 'tests', 'fixtures');
writeFileSync(join(fixtures, 'project.json'), JSON.stringify(project, null, 2) + '\n');
writeFileSync(join(fixtures, 'expected-map-data.json'), JSON.stringify(mapData, null, 2) + '\n');

const counts = Object.fromEntries(
  Object.entries(mapData).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v]),
);
console.log('Referencia extraida:', counts);
