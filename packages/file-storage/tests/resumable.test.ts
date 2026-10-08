import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import {
  FileTooLargeError,
  IncompleteUploadError,
  OffsetMismatchError,
  UnsafePathError,
  appendChunk,
  completePartial,
  discardPartial,
  isPartialPath,
  partialPathFor,
  receivedBytes,
  statStored,
} from '../src/index.ts';

let root: string;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'mapa-resumable-'));
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

const stream = (content: string | Buffer) => Readable.from([Buffer.from(content)]);

/** Cada prueba arranca sin la subida de la anterior. */
const PATH = 'contenidos/m1/testigo.mp4';
beforeEach(async () => {
  await discardPartial(root, PATH);
  await rm(join(root, PATH), { force: true });
});

describe('partialPathFor', () => {
  test('deriva una ruta reconocible y reversible', () => {
    assert.equal(partialPathFor(PATH), 'contenidos/m1/testigo.mp4.parcial');
    assert.ok(isPartialPath(partialPathFor(PATH)));
    assert.ok(!isPartialPath(PATH));
  });
});

describe('receivedBytes', () => {
  test('una subida que no empezó son cero bytes, no un error', async () => {
    assert.equal(await receivedBytes(root, PATH), 0);
  });

  test('refuerza la raíz igual que el resto del paquete', async () => {
    await assert.rejects(
      () => receivedBytes(root, 'contenidos/../fuera.mp4'),
      UnsafePathError,
    );
  });
});

describe('appendChunk', () => {
  test('arma el archivo trozo por trozo', async () => {
    await appendChunk(root, PATH, 0, stream('hola '), { maxBytes: 1000 });
    const second = await appendChunk(root, PATH, 5, stream('mundo'), { maxBytes: 1000 });

    assert.equal(second.received, 10);
    assert.equal(await receivedBytes(root, PATH), 10);
    assert.equal(
      await readFile(join(root, partialPathFor(PATH)), 'utf8'),
      'hola mundo',
    );
  });

  test('crea los directorios que necesita', async () => {
    const path = 'contenidos/nuevo/sub/f.mp3';
    await appendChunk(root, path, 0, stream('x'), { maxBytes: 100 });
    assert.equal(await receivedBytes(root, path), 1);
    await discardPartial(root, path);
  });

  // El corazón del diseño. Sin esto, un reintento de red duplica bytes y deja
  // un video corrupto que en un listado de directorio se ve perfecto.
  test('rechaza un trozo que repite lo que ya llegó, sin escribirlo', async () => {
    await appendChunk(root, PATH, 0, stream('123456'), { maxBytes: 1000 });

    await assert.rejects(
      () => appendChunk(root, PATH, 0, stream('123456'), { maxBytes: 1000 }),
      (error: unknown) => {
        assert.ok(error instanceof OffsetMismatchError);
        assert.equal(error.received, 6);
        assert.equal(error.offered, 0);
        return true;
      },
    );

    assert.equal(await receivedBytes(root, PATH), 6, 'no debe haber duplicado nada');
  });

  test('rechaza un trozo que deja un hueco', async () => {
    await appendChunk(root, PATH, 0, stream('123'), { maxBytes: 1000 });

    await assert.rejects(
      () => appendChunk(root, PATH, 999, stream('456'), { maxBytes: 1000 }),
      OffsetMismatchError,
    );
    assert.equal(await receivedBytes(root, PATH), 3);
  });

  test('el tope se mide contra el acumulado, no contra el trozo', async () => {
    // Diez trozos de 10 bytes con un tope de 50: los primeros cinco entran.
    for (let sent = 0; sent < 50; sent += 10) {
      await appendChunk(root, PATH, sent, stream('x'.repeat(10)), { maxBytes: 50 });
    }
    await assert.rejects(
      () => appendChunk(root, PATH, 50, stream('x'.repeat(10)), { maxBytes: 50 }),
      FileTooLargeError,
    );
  });

  test('un trozo cortado a mitad conserva lo que alcanzó a escribir', async () => {
    await appendChunk(root, PATH, 0, stream('completo:'), { maxBytes: 1000 });

    const failing = new Readable({
      read() {
        this.push(Buffer.from('mitad'));
        this.destroy(new Error('se corto la conexion'));
      },
    });
    await assert.rejects(() => appendChunk(root, PATH, 9, failing, { maxBytes: 1000 }));

    // Reanudar no repite el trozo entero: sigue desde donde quedó de verdad.
    // Por eso el progreso sale de `stat` y no de un contador en memoria.
    const received = await receivedBytes(root, PATH);
    assert.ok(received >= 9, `esperaba al menos 9 bytes, hay ${received}`);
    await appendChunk(root, PATH, received, stream('-resto'), { maxBytes: 1000 });
    assert.equal(await receivedBytes(root, PATH), received + 6);
  });

  test('refuerza la raíz antes de abrir nada', async () => {
    await assert.rejects(
      () => appendChunk(root, 'contenidos/../escape.mp4', 0, stream('x'), { maxBytes: 100 }),
      UnsafePathError,
    );
  });
});

describe('completePartial', () => {
  test('pone la subida en su lugar y deja de haber .parcial', async () => {
    await appendChunk(root, PATH, 0, stream('un video'), { maxBytes: 1000 });
    const result = await completePartial(root, PATH, 8);

    assert.equal(result.bytes, 8);
    assert.equal(result.path, PATH);
    assert.equal(await readFile(join(root, PATH), 'utf8'), 'un video');
    assert.equal(await receivedBytes(root, PATH), 0, 'el .parcial ya no está');

    const leftovers = (await readdir(join(root, 'contenidos/m1')))
      .filter(isPartialPath);
    assert.deepEqual(leftovers, []);
  });

  // Sin esta negativa, una subida sin su último trozo se completa igual: el
  // archivo existe, tiene su fila, y el mapa publica un video truncado que el
  // navegador corta a mitad sin un error en ninguna parte.
  test('se niega a completar una subida incompleta y no toca el destino', async () => {
    await appendChunk(root, PATH, 0, stream('solo la mitad'), { maxBytes: 1000 });

    await assert.rejects(
      () => completePartial(root, PATH, 999),
      (error: unknown) => {
        assert.ok(error instanceof IncompleteUploadError);
        assert.equal(error.received, 13);
        assert.equal(error.expected, 999);
        return true;
      },
    );

    assert.equal(await statStored(root, PATH), undefined, 'el destino no debe existir');
    assert.equal(await receivedBytes(root, PATH), 13, 'la subida sigue reanudable');
  });

  test('se niega sobre una subida que nunca empezó', async () => {
    await assert.rejects(
      () => completePartial(root, PATH, 100),
      (error: unknown) => {
        assert.ok(error instanceof IncompleteUploadError);
        assert.equal(error.received, 0);
        return true;
      },
    );
  });
});

describe('discardPartial', () => {
  test('borra la subida en curso y es idempotente', async () => {
    await appendChunk(root, PATH, 0, stream('x'), { maxBytes: 100 });
    assert.equal(await discardPartial(root, PATH), true);
    assert.equal(await discardPartial(root, PATH), false);
    assert.equal(await receivedBytes(root, PATH), 0);
  });

  test('no toca el archivo definitivo', async () => {
    await appendChunk(root, PATH, 0, stream('listo'), { maxBytes: 100 });
    await completePartial(root, PATH, 5);

    assert.equal(await discardPartial(root, PATH), false);
    assert.ok(await statStored(root, PATH), 'el archivo publicado debe seguir ahí');
  });
});
