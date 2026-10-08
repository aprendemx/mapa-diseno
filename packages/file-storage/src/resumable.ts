import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

import { FileTooLargeError, resolveInRoot } from './store.ts';
import type { WriteResult } from './store.ts';

/**
 * Subidas que sobreviven a un corte.
 *
 * `writeStreamed` sube un archivo en una sola petición, y eso funciona mientras
 * la petición entera quepa en lo que el camino de red tolera. No cabe: Traefik
 * corta de leer el cuerpo a los 60 segundos por omisión, y Cloudflare rechaza
 * cualquier cuerpo de más de 100 MB. Ninguno de los dos está en este
 * repositorio, y el segundo ni siquiera está al alcance de quien lo despliega.
 *
 * Así que el tamaño de archivo que el editor acepta deja de depender de ellos.
 * Un archivo llega en trozos, cada uno una petición corta, y ninguno se acerca
 * a un límite de nadie.
 *
 * **El estado de la subida es el archivo `.parcial`, y su tamaño es cuántos
 * bytes llegaron.** No hay fila, ni tabla, ni sesión en memoria. Eso descarta de
 * entrada la falla que vendría con cualquiera de las tres: que el contador y el
 * disco digan cosas distintas, y que el archivo se complete a un tamaño que
 * nunca tuvo. Además el barrido ya recoge los `.parcial` que nadie terminó,
 * porque no tienen fila que los referencie.
 */

/** Sufijo de una subida en curso. Determinista: es lo que permite reanudar. */
const PARTIAL = '.parcial';

/**
 * El cliente ofreció un trozo que no empieza donde termina lo que hay.
 *
 * Lleva el tamaño real para que la respuesta le diga desde dónde seguir. Un
 * `append` que aceptara el trozo igual duplicaría bytes ante cualquier
 * reintento, y el resultado sería un video corrupto que en un listado de
 * directorio se ve perfectamente normal.
 */
export class OffsetMismatchError extends Error {
  // Campos declarados y asignados a mano, no `constructor(readonly x)`. Las
  // parameter properties de TypeScript no son sintaxis borrable --generan
  // codigo-- y este paquete corre sin build: Node las rechaza con
  // ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX, y de paso tumba a todo el que importe
  // el indice del paquete.
  readonly received: number;
  readonly offered: number;

  constructor(received: number, offered: number) {
    super(`La subida tiene ${received} bytes y el trozo empieza en ${offered}.`);
    this.received = received;
    this.offered = offered;
  }
}

/** Se pidió completar una subida a la que todavía le faltan bytes. */
export class IncompleteUploadError extends Error {
  readonly received: number;
  readonly expected: number;

  constructor(received: number, expected: number) {
    super(`La subida tiene ${received} de ${expected} bytes.`);
    this.received = received;
    this.expected = expected;
  }
}

/** La ruta de la subida en curso que corresponde a un archivo almacenado. */
export function partialPathFor(storedPath: string): string {
  return `${storedPath}${PARTIAL}`;
}

/**
 * Si una ruta es una subida en curso y no un archivo del catálogo.
 *
 * El barrido lo usa para tratarlas aparte: un `.parcial` reciente es una subida
 * que alguien está haciendo en este momento, no un huérfano.
 */
export function isPartialPath(path: string): boolean {
  return path.endsWith(PARTIAL);
}

/**
 * Cuántos bytes de esta subida ya están en disco. `0` si no empezó.
 *
 * Es la única fuente de verdad del progreso, y es la que el cliente consulta
 * para reanudar. Que salga de `stat` y no de un contador es a propósito: un
 * contador puede sobrevivir a un corte con un valor que el disco no respalda.
 */
export async function receivedBytes(
  mediaRoot: string,
  storedPath: string,
): Promise<number> {
  const partial = resolveInRoot(mediaRoot, partialPathFor(storedPath));
  try {
    return (await stat(partial)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}

export interface AppendResult {
  /** Total acumulado tras este trozo. */
  received: number;
}

/**
 * Agrega un trozo al final de la subida.
 *
 * Exige que `offset` sea **exactamente** el tamaño actual. Un trozo que empieza
 * antes es uno que ya llegó, y uno que empieza después deja un hueco: en los
 * dos casos la respuesta correcta es decir cuántos bytes hay y dejar que el
 * cliente reanude desde ahí, no escribir y confiar.
 *
 * Si la conexión se corta a mitad de un trozo, lo que quedó escrito **se
 * conserva**. No hay nada que deshacer: el tamaño del archivo sigue siendo la
 * verdad, y el reintento continúa desde donde realmente quedó en lugar de
 * repetir el trozo entero.
 *
 * No es reentrante por sí sola. Dos llamadas sobre la misma subida pueden leer
 * el mismo tamaño y las dos escribir; quien la invoque tiene que serializarlas.
 */
export async function appendChunk(
  mediaRoot: string,
  storedPath: string,
  offset: number,
  chunk: Readable,
  options: { maxBytes: number },
): Promise<AppendResult> {
  const partial = resolveInRoot(mediaRoot, partialPathFor(storedPath));

  const received = await receivedBytes(mediaRoot, storedPath);
  if (offset !== received) throw new OffsetMismatchError(received, offset);

  await mkdir(dirname(partial), { recursive: true });

  let written = 0;
  await pipeline(
    chunk,
    async function* (source) {
      for await (const piece of source) {
        written += (piece as Buffer).length;
        // El tope se comprueba contra el acumulado, no contra el trozo: un
        // cliente que declara 10 MB y después manda 4 GB en trozos chicos pasa
        // cualquier comprobación que mire un trozo a la vez.
        if (received + written > options.maxBytes) {
          throw new FileTooLargeError(
            `El archivo supera el límite de ${options.maxBytes} bytes.`,
          );
        }
        yield piece;
      }
    },
    createWriteStream(partial, { flags: 'a' }),
  );

  return { received: received + written };
}

/**
 * Pone la subida terminada en su ruta definitiva.
 *
 * Se niega si el tamaño no es el que se declaró al empezar. Sin esa
 * comprobación, una subida a la que le falta el último trozo se completaría
 * igual: el archivo existiría, tendría su fila, y el mapa publicaría un video
 * truncado que el navegador corta a mitad sin un error en ninguna parte.
 *
 * El `rename` es atómico en el mismo sistema de archivos, así que la ruta
 * definitiva nunca existe a medias.
 */
export async function completePartial(
  mediaRoot: string,
  storedPath: string,
  expectedBytes: number,
): Promise<WriteResult> {
  const partial = resolveInRoot(mediaRoot, partialPathFor(storedPath));
  const destination = resolveInRoot(mediaRoot, storedPath);

  let size: number;
  try {
    size = (await stat(partial)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    throw new IncompleteUploadError(0, expectedBytes);
  }

  if (size !== expectedBytes) throw new IncompleteUploadError(size, expectedBytes);

  await rename(partial, destination);
  return { path: storedPath, bytes: size };
}

/**
 * Descarta una subida en curso. Idempotente.
 *
 * La usa cancelar, y también el rechazo por tamaño: una subida que ya pasó el
 * tope no va a poder completarse nunca, así que dejar los bytes esperando al
 * barrido sería ocupar disco por nada.
 */
export async function discardPartial(
  mediaRoot: string,
  storedPath: string,
): Promise<boolean> {
  const partial = resolveInRoot(mediaRoot, partialPathFor(storedPath));
  try {
    await unlink(partial);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
