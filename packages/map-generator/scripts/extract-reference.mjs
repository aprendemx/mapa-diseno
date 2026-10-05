// Congela una entrega del pipeline PowerShell como referencia golden.
//
//   node scripts/extract-reference.mjs --entrega <carpeta> --nombre 2026-11
//
// <carpeta> es el directorio descomprimido de la entrega: el que tiene
// datos/proyecto.json y entrega/ABRIR MAPA.html dentro.
//
// La salida no se escribe a mano nunca. Es lo que produjo produccion, y es la
// definicion de correcto: si cambia, cambio la definicion.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv, exit } from 'node:process';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', 'tests', 'fixtures');

function flag(name) {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
}

const entrega = flag('entrega');
const nombre = flag('nombre');

if (!entrega || !nombre) {
  console.error('Uso: node scripts/extract-reference.mjs --entrega <carpeta> --nombre <aaaa-mm>');
  exit(1);
}
if (!/^\d{4}-\d{2}$/.test(nombre)) {
  console.error('El nombre debe ser aaaa-mm, por ejemplo 2026-11.');
  exit(1);
}

const MARKERS = /\/\*__DATOS_GENERADOS_INICIO__\*\/(.*?)\/\*__DATOS_GENERADOS_FIN__\*\//s;

const html = readFileSync(join(entrega, 'entrega', 'ABRIR MAPA.html'), 'utf8');
const block = html.match(MARKERS);
if (!block) throw new Error('No se encontraron los marcadores de datos generados.');

const assignment = block[1].match(/const\s+PROJECT_DATA\s*=\s*(\{.*\})\s*;/s);
if (!assignment) throw new Error('No se encontro la asignacion de PROJECT_DATA.');

const mapData = JSON.parse(assignment[1]);
const project = JSON.parse(readFileSync(join(entrega, 'datos', 'proyecto.json'), 'utf8'));

const destino = join(fixtures, nombre);
mkdirSync(destino, { recursive: true });
writeFileSync(join(destino, 'project.json'), JSON.stringify(project, null, 2) + '\n');
writeFileSync(join(destino, 'expected-map-data.json'), JSON.stringify(mapData, null, 2) + '\n');
// La pagina completa va tambien: leerla de entrega/ ataria las pruebas a una
// carpeta que esta en .gitignore por peso.
writeFileSync(join(destino, 'published.html'), html);

console.log(`Referencia ${nombre} congelada:`);
console.log(' ', Object.fromEntries(
  Object.entries(mapData).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v]),
));
console.log(`\nAgregala en tests/fixtures.ts para que las pruebas la usen.`);
