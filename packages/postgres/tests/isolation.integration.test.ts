import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import type { Appearance, MapData } from '@mapa-mexico/map-generator';
import type { MapRow, MediumInput } from '@mapa-mexico/project-store';

import {
  addFile,
  createMap,
  createMedium,
  deleteMap,
  deleteMedium,
  getAppearance,
  getMedium,
  getPublication,
  latestPublication,
  listMedia,
  listPublications,
  listReferencedPaths,
  readCatalog,
  recordPublication,
  removeFile,
  reorderMedia,
  reorderWitnesses,
  updateAppearance,
  updateFileDescription,
  updateMedium,
  createUser,
  replaceCatalog,
  setDefaultMap,
  listMaps,
  getDefaultMap,
} from '../src/index.ts';
import { toRows } from '@mapa-mexico/project-store';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const schema = readFileSync(
  join(root, 'packages', 'project-store', 'src', 'schema.sql'),
  'utf8',
);
const appearance = (
  JSON.parse(
    readFileSync(
      join(root, 'packages', 'map-generator', 'tests', 'fixtures', '2026-08', 'project.json'),
      'utf8',
    ),
  ) as { appearance: Appearance }
).appearance;

const DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ?? 'postgres://mapa:mapa_dev@127.0.0.1:5432/mapa_test';
const isLocal = /@(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(DATABASE_URL);
const isTestDatabase = /_test(\?|$)/.test(DATABASE_URL);

let pool: pg.Pool | undefined;
let unavailable = 'TEST_DATABASE_URL must be a loopback database whose name ends in _test';

/** Dos mapas vecinos. Todo lo de abajo prueba que no se tocan. */
let uno: MapRow;
let dos: MapRow;
let userId = '';

const medium = (name: string, overrides: Partial<MediumInput> = {}): MediumInput => ({
  name,
  stateId: 'jal',
  active: true,
  notes: 'Una nota',
  coverageText: '',
  coverageStates: [],
  socialEnabled: false,
  socialThemes: [],
  ...overrides,
});

const mapData = (): MapData => ({
  appearance,
  states: [],
  media: [],
  coverage: [],
  campaigns: [],
  contents: [],
});

before(async () => {
  if (!isLocal || !isTestDatabase) return;
  const candidate = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
  try {
    await candidate.query('drop schema public cascade; create schema public;');
    await candidate.query(schema);
    await candidate.query(
      "insert into states (id, name, position) values ('jal','Jalisco',1), ('col','Colima',2)",
    );

    uno = await createMap(candidate, {
      slug: 'uno', name: 'Mapa Uno', appearance, isDefault: true,
    });
    dos = await createMap(candidate, { slug: 'dos', name: 'Mapa Dos', appearance });

    const user = await createUser(candidate, {
      email: 'editor@ejemplo.mx', name: 'Editora', passwordHash: 'no-importa',
    });
    userId = user.id;

    pool = candidate;
  } catch (error) {
    unavailable = error instanceof Error ? error.message : String(error);
    await candidate.end();
  }
});

after(async () => {
  await pool?.end();
});

const skip = (t: { skip: (reason: string) => void }): boolean => {
  if (pool) return false;
  t.skip(`database unavailable: ${unavailable}`);
  return true;
};

/**
 * Por qué existe esta suite.
 *
 * Mientras hubo un solo catálogo, "el mapa equivocado" no era un estado
 * posible. Con varios, cada consulta necesita su `map_id` — y la que se olvide
 * no falla: devuelve, edita o borra las filas del mapa vecino, en silencio y
 * con éxito aparente.
 *
 * Así que todo lo de aquí pasa un identificador ajeno a propósito y exige que
 * la respuesta sea "no existe". Fallar cerrado, nunca abierto.
 */
describe('un mapa no alcanza al otro', () => {
  let medioDeUno = '';
  let medioDeDos = '';

  test('cada mapa recibe su propio catálogo', async (t) => {
    if (skip(t)) return;

    medioDeUno = await createMedium(pool!, uno.id, medium('Radio Uno'));
    medioDeDos = await createMedium(pool!, dos.id, medium('Radio Dos'));

    assert.deepEqual((await listMedia(pool!, uno.id)).map((m) => m.id), [medioDeUno]);
    assert.deepEqual((await listMedia(pool!, dos.id)).map((m) => m.id), [medioDeDos]);
  });

  describe('lecturas', () => {
    test('getMedium con el mapa ajeno no encuentra nada', async (t) => {
      if (skip(t)) return;
      assert.ok(await getMedium(pool!, uno.id, medioDeUno));
      assert.equal(await getMedium(pool!, dos.id, medioDeUno), undefined);
      assert.equal(await getMedium(pool!, uno.id, medioDeDos), undefined);
    });

    test('readCatalog trae solo los medios de su mapa', async (t) => {
      if (skip(t)) return;
      const soloUno = await readCatalog(pool!, uno.id);
      assert.equal(soloUno.map.id, uno.id);
      assert.deepEqual(soloUno.media.map((m) => m.id), [medioDeUno]);
      assert.ok(soloUno.media.every((m) => m.map_id === uno.id));
    });

    test('readCatalog de un mapa inexistente falla, no devuelve vacío', async (t) => {
      if (skip(t)) return;
      // Un catálogo vacío y un mapa que no existe no son lo mismo: publicar el
      // primero deja una página en blanco, publicar el segundo no debe poder.
      await assert.rejects(
        () => readCatalog(pool!, '00000000-0000-4000-8000-00000000dead'),
        /No existe el mapa/,
      );
    });

    test('los estados sí se comparten', async (t) => {
      if (skip(t)) return;
      const [a, b] = [await readCatalog(pool!, uno.id), await readCatalog(pool!, dos.id)];
      assert.deepEqual(a.states, b.states);
      assert.equal(a.states.length, 2);
    });
  });

  describe('escrituras', () => {
    test('updateMedium con el mapa ajeno no edita nada', async (t) => {
      if (skip(t)) return;

      const resultado = await updateMedium(pool!, dos.id, medioDeUno, medium('Secuestrado'));
      assert.equal(resultado, false, 'debe informar que no existe');

      const intacto = await getMedium(pool!, uno.id, medioDeUno);
      assert.equal(intacto?.name, 'Radio Uno', 'el nombre del vecino no puede haber cambiado');
    });

    test('deleteMedium con el mapa ajeno no borra nada', async (t) => {
      if (skip(t)) return;
      assert.equal(await deleteMedium(pool!, dos.id, medioDeUno), false);
      assert.ok(await getMedium(pool!, uno.id, medioDeUno));
    });

    test('reorderMedia no reordena el catálogo vecino', async (t) => {
      if (skip(t)) return;

      const antes = (await getMedium(pool!, uno.id, medioDeUno))!.position;
      await reorderMedia(pool!, dos.id, [medioDeUno]);
      const despues = (await getMedium(pool!, uno.id, medioDeUno))!.position;
      assert.equal(despues, antes);
    });

    test('la apariencia es de cada mapa', async (t) => {
      if (skip(t)) return;

      await updateAppearance(pool!, uno.id, { ...appearance, glowOpacity: 10 });
      assert.equal((await getAppearance(pool!, uno.id)).glowOpacity, 10);
      assert.equal(
        (await getAppearance(pool!, dos.id)).glowOpacity,
        appearance.glowOpacity,
        'cambiar la apariencia de un mapa no puede tocar la del otro',
      );
    });
  });

  describe('archivos', () => {
    let archivo = '';

    test('adjuntar a un medio del mapa ajeno se rechaza', async (t) => {
      if (skip(t)) return;
      // No basta con que no encuentre el medio: si el archivo entrara, sus
      // bytes quedarían bajo un directorio que ese mapa no sirve.
      await assert.rejects(
        () => addFile(pool!, {
          id: 'f-colado', mapId: dos.id, mediumId: medioDeUno,
          kind: 'video', path: 'contenidos/x/f-colado.mp4',
        }),
        /no pertenece al mapa/,
      );
      assert.equal((await getMedium(pool!, uno.id, medioDeUno))!.files.length, 0);
    });

    test('adjuntar al propio medio funciona', async (t) => {
      if (skip(t)) return;
      const record = await addFile(pool!, {
        id: 'f-uno', mapId: uno.id, mediumId: medioDeUno,
        kind: 'video', path: 'contenidos/radio-uno/f-uno.mp4',
      });
      archivo = record.id;
      assert.equal((await getMedium(pool!, uno.id, medioDeUno))!.files.length, 1);
    });

    test('describir o quitar con el mapa ajeno no hace nada', async (t) => {
      if (skip(t)) return;

      assert.equal(
        await updateFileDescription(pool!, dos.id, medioDeUno, archivo, 'secuestrada'),
        false,
      );
      assert.equal(await removeFile(pool!, dos.id, medioDeUno, archivo), undefined);

      const medio = (await getMedium(pool!, uno.id, medioDeUno))!;
      assert.equal(medio.files.length, 1, 'el archivo del vecino sigue ahí');
      assert.equal(medio.files[0]?.description, '');
    });

    test('reordenar testigos del mapa ajeno se rechaza', async (t) => {
      if (skip(t)) return;
      await assert.rejects(
        () => reorderWitnesses(pool!, dos.id, medioDeUno, [archivo]),
        /no pertenece al mapa/,
      );
    });

    test('las rutas referenciadas son las de su mapa', async (t) => {
      if (skip(t)) return;
      // El barrido compara contra esto. Si devolviera las de todos los mapas
      // conservaría huérfanos ajenos; si ignorara el mapa, borraría archivos
      // vivos del vecino.
      assert.deepEqual([...await listReferencedPaths(pool!, uno.id)],
        ['contenidos/radio-uno/f-uno.mp4']);
      assert.deepEqual([...await listReferencedPaths(pool!, dos.id)], []);
    });
  });

  describe('publicaciones', () => {
    let deUno = '';

    test('cada mapa tiene su propio historial', async (t) => {
      if (skip(t)) return;

      const a = await recordPublication(pool!, {
        mapId: uno.id, userId, userName: 'Editora', mapData: mapData(),
      });
      deUno = a.id;
      await recordPublication(pool!, {
        mapId: dos.id, userId, userName: 'Editora', mapData: mapData(),
      });

      assert.deepEqual((await listPublications(pool!, uno.id)).map((p) => p.id), [deUno]);
      assert.equal((await listPublications(pool!, dos.id)).length, 1);
      assert.notEqual((await listPublications(pool!, dos.id))[0]?.id, deUno);
    });

    test('no se puede restaurar la publicación de otro mapa', async (t) => {
      if (skip(t)) return;
      // Sin esto, un id copiado del historial ajeno publicaría el catálogo de
      // otro mapa en esta ruta.
      assert.ok(await getPublication(pool!, uno.id, deUno));
      assert.equal(await getPublication(pool!, dos.id, deUno), undefined);
    });

    test('la última publicación es la de su mapa', async (t) => {
      if (skip(t)) return;
      assert.equal((await latestPublication(pool!, uno.id))?.id, deUno);
      assert.notEqual((await latestPublication(pool!, dos.id))?.id, deUno);
    });
  });

  describe('importar un catálogo', () => {
    test('reemplaza el del mapa indicado y deja intacto el del vecino', async (t) => {
      if (skip(t)) return;

      // La más destructiva de todas. `replaceCatalog` arranca con un DELETE,
      // y sin el `where map_id` importar un mapa vacía el catálogo de todos
      // los demás — con éxito aparente y sin que nadie se entere hasta que
      // alguien abre el otro mapa.
      const antes = (await listMedia(pool!, uno.id)).length;
      assert.ok(antes > 0, 'el vecino tiene que tener algo que perder');

      const importado = toRows(
        {
          version: 4,
          appearance,
          states: [{ id: 'jal', name: 'Jalisco' }, { id: 'col', name: 'Colima' }],
          media: [{
            id: 'importado-en-dos',
            name: 'Importado',
            folderSlug: 'importado',
            active: true,
            stateId: 'col',
            notes: '',
            coverageText: '',
            coverageStates: [],
            files: [],
            socialEnabled: false,
            socialThemes: [],
            witnessOrder: [],
          }],
        },
        dos,
      );
      await replaceCatalog(pool!, importado);

      assert.deepEqual(
        (await listMedia(pool!, dos.id)).map((m) => m.id),
        ['importado-en-dos'],
      );
      assert.equal(
        (await listMedia(pool!, uno.id)).length,
        antes,
        'importar en un mapa no puede vaciar el catálogo de otro',
      );
    });
  });

  describe('el mapa de la raíz', () => {
    test('solo uno puede ser el predeterminado a la vez', async (t) => {
      if (skip(t)) return;

      assert.equal((await getDefaultMap(pool!))?.id, uno.id);

      await setDefaultMap(pool!, dos.id);
      assert.equal((await getDefaultMap(pool!))?.id, dos.id);
      assert.equal(
        (await listMaps(pool!)).filter((m) => m.is_default).length,
        1,
        'dos mapas en la raíz dejarían el dominio sirviendo uno de los dos al azar',
      );

      await setDefaultMap(pool!, uno.id);
      assert.equal((await getDefaultMap(pool!))?.id, uno.id);
    });

    test('marcar como predeterminado un mapa inexistente no deja la raíz vacía', async (t) => {
      if (skip(t)) return;

      const resultado = await setDefaultMap(pool!, '00000000-0000-4000-8000-00000000dead');
      assert.equal(resultado, false);
      // El update que desmarca corre antes del que marca, así que un id que no
      // existe podría dejar cero mapas predeterminados: la raíz sin servir nada.
      assert.ok(await getDefaultMap(pool!), 'la raíz no puede quedarse sin mapa');
    });
  });

  describe('borrar un mapa', () => {
    test('se lleva lo suyo y nada del vecino', async (t) => {
      if (skip(t)) return;

      assert.equal(await deleteMap(pool!, dos.id), true);

      assert.deepEqual((await listMedia(pool!, uno.id)).map((m) => m.id), [medioDeUno]);
      assert.equal((await listPublications(pool!, uno.id)).length, 1);
      assert.ok(await getAppearance(pool!, uno.id));
      assert.equal((await getMedium(pool!, uno.id, medioDeUno))!.files.length, 1);

      const huerfanas = await pool!.query(
        'select count(*)::int as n from media where map_id = $1', [dos.id],
      );
      assert.equal((huerfanas.rows[0] as { n: number }).n, 0, 'la cascada debe haber limpiado');
    });
  });

  describe('lo que guarda una publicación', () => {
    test('conserva el orden de claves tal cual', async (t) => {
      if (skip(t)) return;

      // La columna es `json` y no `jsonb` por esto. jsonb normaliza y reordena,
      // y de aquí sale el contenido que se vuelve a renderizar al restaurar: con
      // jsonb una restauración publicaba los mismos datos con el orden barajado,
      // y comparar dos publicaciones por texto nunca daba igual —así que
      // publicar sin cambios añadía una entrada al historial cada vez.
      const data = mapData();
      const guardada = await recordPublication(pool!, {
        mapId: uno.id, userId, userName: 'Editora', mapData: data,
      });

      const leida = await getPublication(pool!, uno.id, guardada.id);
      assert.equal(
        JSON.stringify(leida?.mapData),
        JSON.stringify(data),
        'el texto tiene que volver idéntico, no solo equivalente',
      );
      assert.deepEqual(
        Object.keys(leida!.mapData),
        Object.keys(data),
        'y las claves en el mismo orden',
      );
    });
  });
});
