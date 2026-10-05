import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, readlink, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import {
  FileTooLargeError,
  UnsafePathError,
  listStored,
  moveStored,
  removeStored,
  resolveInRoot,
  statStored,
  pointRootAt,
  writeFileAtomic,
  writeStreamed,
} from '../src/index.ts';

let root: string;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'mapa-storage-'));
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

const stream = (content: string | Buffer) => Readable.from([Buffer.from(content)]);

describe('resolveInRoot', () => {
  test('refuses to resolve anything outside the media root', () => {
    assert.throws(() => resolveInRoot(root, 'contenidos/../../etc/passwd'), UnsafePathError);
    assert.throws(() => resolveInRoot(root, '/etc/passwd'), UnsafePathError);
    assert.throws(() => resolveInRoot(root, 'otra/a.mp4'), UnsafePathError);
  });
});

describe('writeStreamed', () => {
  test('writes the bytes and reports how many', async () => {
    const result = await writeStreamed(
      root, 'contenidos/m1/f1.mp4', stream('hola mundo'), { maxBytes: 1000 },
    );
    assert.equal(result.bytes, 10);
    assert.equal(await readFile(join(root, 'contenidos/m1/f1.mp4'), 'utf8'), 'hola mundo');
  });

  test('creates the directories it needs', async () => {
    await writeStreamed(root, 'contenidos/nuevo/sub/f.mp3', stream('x'), { maxBytes: 100 });
    assert.ok(await statStored(root, 'contenidos/nuevo/sub/f.mp3'));
  });

  test('refuses an oversized body and leaves nothing behind', async () => {
    await assert.rejects(
      () => writeStreamed(root, 'contenidos/m1/big.mp4', stream('x'.repeat(200)), { maxBytes: 100 }),
      FileTooLargeError,
    );
    assert.equal(await statStored(root, 'contenidos/m1/big.mp4'), undefined);

    const leftovers = (await readdir(join(root, 'contenidos/m1')))
      .filter((name) => name.includes('.part-'));
    assert.deepEqual(leftovers, [], 'the temporary file must be cleaned up');
  });

  test('a failed upload never leaves a truncated file in place', async () => {
    const failing = new Readable({
      read() {
        this.push(Buffer.from('primera parte'));
        this.destroy(new Error('se corto la conexion'));
      },
    });

    await assert.rejects(
      () => writeStreamed(root, 'contenidos/m1/corte.mp4', failing, { maxBytes: 1_000_000 }),
    );
    // The destination either does not exist or is complete. Never half a video
    // that looks fine in a directory listing.
    assert.equal(await statStored(root, 'contenidos/m1/corte.mp4'), undefined);
  });

  test('rewriting an existing path replaces it wholesale', async () => {
    await writeStreamed(root, 'contenidos/m1/f2.mp4', stream('viejo'), { maxBytes: 100 });
    await writeStreamed(root, 'contenidos/m1/f2.mp4', stream('nuevo mas largo'), { maxBytes: 100 });
    assert.equal(await readFile(join(root, 'contenidos/m1/f2.mp4'), 'utf8'), 'nuevo mas largo');
  });

  test('refuses an unsafe destination before opening anything', async () => {
    await assert.rejects(
      () => writeStreamed(root, 'contenidos/../escape.mp4', stream('x'), { maxBytes: 100 }),
      UnsafePathError,
    );
  });
});

describe('moveStored', () => {
  test('moves a file and creates the destination directory', async () => {
    await writeStreamed(root, 'contenidos/origen/a.mp4', stream('datos'), { maxBytes: 100 });
    await moveStored(root, 'contenidos/origen/a.mp4', 'contenidos/destino/b.mp4');

    assert.equal(await statStored(root, 'contenidos/origen/a.mp4'), undefined);
    assert.equal(await readFile(join(root, 'contenidos/destino/b.mp4'), 'utf8'), 'datos');
  });

  test('moving to where it already is does nothing', async () => {
    await writeStreamed(root, 'contenidos/quieto/a.mp4', stream('igual'), { maxBytes: 100 });
    await moveStored(root, 'contenidos/quieto/a.mp4', 'contenidos/quieto/a.mp4');
    assert.equal(await readFile(join(root, 'contenidos/quieto/a.mp4'), 'utf8'), 'igual');
  });
});

describe('removeStored', () => {
  test('reports whether there was anything to remove', async () => {
    await writeStreamed(root, 'contenidos/m1/borrar.mp4', stream('x'), { maxBytes: 100 });
    assert.equal(await removeStored(root, 'contenidos/m1/borrar.mp4'), true);
    assert.equal(await removeStored(root, 'contenidos/m1/borrar.mp4'), false);
  });
});

describe('listStored', () => {
  test('finds every file under the root, including .part leftovers', async () => {
    const isolated = await mkdtemp(join(tmpdir(), 'mapa-list-'));
    try {
      await mkdir(join(isolated, 'contenidos/m1'), { recursive: true });
      await writeFile(join(isolated, 'contenidos/m1/a.mp4'), 'a');
      await writeFile(join(isolated, 'contenidos/m1/b.mp4.part-abc'), 'b');
      await mkdir(join(isolated, 'contenidos/m2'), { recursive: true });
      await writeFile(join(isolated, 'contenidos/m2/c.mp3'), 'c');

      assert.deepEqual(await listStored(isolated), [
        'contenidos/m1/a.mp4',
        'contenidos/m1/b.mp4.part-abc',
        'contenidos/m2/c.mp3',
      ]);
    } finally {
      await rm(isolated, { recursive: true, force: true });
    }
  });

  test('an empty root is not an error', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'mapa-empty-'));
    try {
      assert.deepEqual(await listStored(empty), []);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});

describe('writeFileAtomic', () => {
  test('writes the file', async () => {
    const path = join(root, 'publicado', 'index.html');
    await writeFileAtomic(path, '<html>uno</html>');
    assert.equal(await readFile(path, 'utf8'), '<html>uno</html>');
  });

  test('replaces an existing file wholesale, leaving no temporary behind', async () => {
    const path = join(root, 'publicado', 'index.html');
    await writeFileAtomic(path, '<html>dos, bastante mas largo</html>');
    assert.equal(await readFile(path, 'utf8'), '<html>dos, bastante mas largo</html>');

    const leftovers = (await readdir(join(root, 'publicado')))
      .filter((name) => name.includes('.new-'));
    assert.deepEqual(leftovers, []);
  });

  test('creates the directory it needs', async () => {
    const path = join(root, 'publicado', 'anidado', 'index.html');
    await writeFileAtomic(path, 'x');
    assert.equal(await readFile(path, 'utf8'), 'x');
  });
});

describe('pointRootAt', () => {
  const sitio = () => mkdtemp(join(tmpdir(), 'mapa-sitio-'));

  test('crea los dos enlaces y el directorio del mapa', async () => {
    const base = await sitio();
    try {
      const links = await pointRootAt(base, 'redmexico');
      assert.deepEqual(links.map((l) => [l.name, l.target, l.changed]), [
        ['index.html', 'redmexico/index.html', true],
        ['contenidos', 'redmexico/contenidos', true],
      ]);
      assert.equal(await readlink(join(base, 'index.html')), 'redmexico/index.html');
      assert.equal(await readlink(join(base, 'contenidos')), 'redmexico/contenidos');
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test('es idempotente', async () => {
    const base = await sitio();
    try {
      await pointRootAt(base, 'redmexico');
      const otra = await pointRootAt(base, 'redmexico');
      assert.deepEqual(otra.map((l) => l.changed), [false, false]);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test('repunta a otro mapa sin mover nada', async () => {
    const base = await sitio();
    try {
      await pointRootAt(base, 'redmexico');
      await writeFileAtomic(join(base, 'redmexico', 'index.html'), '<html>red</html>');
      await writeFileAtomic(join(base, 'telesecundarias', 'index.html'), '<html>tele</html>');

      const links = await pointRootAt(base, 'telesecundarias');
      assert.deepEqual(links.map((l) => l.changed), [true, true]);

      // La raiz entrega el otro mapa, y el primero sigue en su sitio.
      assert.equal(await readFile(join(base, 'index.html'), 'utf8'), '<html>tele</html>');
      assert.equal(
        await readFile(join(base, 'redmexico', 'index.html'), 'utf8'),
        '<html>red</html>',
      );
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  test('se niega a pisar un archivo real en la raíz', async () => {
    const base = await sitio();
    try {
      // Una publicación del sistema anterior quedó ahí. Borrarla sin avisar
      // sería borrar la única copia de algo.
      await writeFileAtomic(join(base, 'index.html'), '<html>a mano</html>');
      await assert.rejects(() => pointRootAt(base, 'redmexico'), UnsafePathError);
      assert.equal(await readFile(join(base, 'index.html'), 'utf8'), '<html>a mano</html>');
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
