import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  extensionOf,
  isAllowedExtension,
  isSafeRelativePath,
  kindOf,
  storagePath,
} from '../src/index.ts';

describe('storagePath', () => {
  test('depends only on identifiers, never on the medium name', () => {
    // The whole point: renaming a medium must not move 2.2 GB of video.
    const before = storagePath('canal-once', 'archivo-123-abc', 'Nota Final.MP4');
    const after = storagePath('canal-once', 'archivo-123-abc', 'Nota Final.MP4');
    assert.equal(before, after);
    assert.equal(before, 'contenidos/canal-once/archivo-123-abc-nota-final.mp4');
  });

  test('keeps a readable label for whoever is looking at the directory', () => {
    assert.equal(
      storagePath('m1', 'f1', 'Salud Digital — Higiene del Sueño.mp4'),
      'contenidos/m1/f1-salud-digital-higiene-del-sueno.mp4',
    );
  });

  test('survives a filename with nothing sluggable in it', () => {
    assert.equal(storagePath('m1', 'f1', '¿?!.mp4'), 'contenidos/m1/f1-medio.mp4');
  });

  test('treats a dotfile as having no extension, and upload refuses it anyway', () => {
    // `.mp4` is a hidden file called "mp4", not an mp4. The path still comes
    // out unambiguous, but the real guard is upstream: the upload endpoint
    // rejects it because `isAllowedExtension` sees no extension at all.
    assert.equal(storagePath('m1', 'f1', '.mp4'), 'contenidos/m1/f1-mp4');
    assert.equal(isAllowedExtension('.mp4'), false);
  });

  test('lowercases the extension', () => {
    assert.ok(storagePath('m1', 'f1', 'A.MOV').endsWith('.mov'));
  });

  test('truncates a very long label without trailing dashes', () => {
    const path = storagePath('m1', 'f1', `${'palabra '.repeat(30)}.mp4`);
    const name = path.split('/').pop()!;
    assert.ok(name.length < 60, name);
    assert.ok(!name.includes('-.'), name);
  });
});

describe('classification', () => {
  test('reads the extension, not what the browser claimed', () => {
    assert.equal(kindOf('a.mp4'), 'video');
    assert.equal(kindOf('a.MP3'), 'audio');
    assert.equal(kindOf('a.png'), 'imagen');
    assert.equal(kindOf('a.flac'), 'audio');
    assert.equal(kindOf('sin-extension'), 'imagen');
  });

  test('accepts the formats the map can play and refuses the rest', () => {
    for (const name of ['a.mp4', 'a.mp3', 'a.png', 'a.WEBM', 'a.avif']) {
      assert.equal(isAllowedExtension(name), true, name);
    }
    for (const name of ['a.exe', 'a.html', 'a.pdf', 'a.zip', 'a', 'a.', '.mp4']) {
      assert.equal(isAllowedExtension(name), false, name);
    }
  });

  test('a dotfile has no extension to speak of', () => {
    assert.equal(extensionOf('.mp4'), '');
    assert.equal(extensionOf('archivo.'), '');
  });
});

describe('isSafeRelativePath', () => {
  test('accepts paths inside the media root', () => {
    assert.equal(isSafeRelativePath('contenidos/m1/f1.mp4'), true);
    assert.equal(isSafeRelativePath('contenidos/jal/canal/a.mp3'), true);
  });

  for (const attempt of [
    'contenidos/../../etc/passwd',
    'contenidos/m1/../../../secret',
    '../contenidos/m1/a.mp4',
    '/etc/passwd',
    'C:\\Windows\\win.ini',
    'contenidos\\..\\..\\secret',
    'otra-carpeta/a.mp4',
    'contenidos',
    'contenidos//a.mp4',
    'contenidos/./a.mp4',
    'contenidos/m1/a\0.mp4',
  ]) {
    test(`refuses ${JSON.stringify(attempt)}`, () => {
      assert.equal(isSafeRelativePath(attempt), false);
    });
  }
});
