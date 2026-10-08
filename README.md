# Mapa interactivo de México

Editor web del mapa de medios públicos. Reemplaza la herramienta anterior de
`.bat` + PowerShell local por una aplicación con login, manteniendo intacto el
mapa que se publica.

## Estructura

| Paquete | Qué hace | Dependencias |
| --- | --- | --- |
| `packages/map-generator` | Proyecta el catálogo a las seis tablas que consume el mapa | ninguna |
| `packages/project-store` | Traduce entre el documento y las filas; valida entradas | ninguna |
| `packages/auth` | Hash de contraseñas y sesiones | ninguna |
| `packages/file-storage` | Rutas de almacenamiento y escritura de archivos | ninguna |
| `packages/postgres` | Adaptador del driver. Sin reglas propias | `pg` |
| `apps/editor` | Aplicación Nuxt | Nuxt |

Los cinco paquetes puros corren con `node --test` sin build: Node ejecuta
TypeScript directo. Solo `postgres` abre un socket, y eso se ve en el árbol de
directorios a propósito.

## Varios mapas en un dominio

Cada temática es un mapa con su propio catálogo y su propia apariencia.
Comparten los 32 estados, la plantilla y las cuentas.

```
sitio/
├── index.html   -> redmexico/index.html     (enlaces al mapa predeterminado)
├── contenidos   -> redmexico/contenidos
├── redmexico/{index.html, contenidos/…}
└── telesecundarias/{index.html, contenidos/…}
```

La página publicada referencia `contenidos/…` **relativo a sí misma**, así que
cada mapa en su directorio funciona sin reescribir una sola ruta almacenada.
La raíz del dominio son dos enlaces simbólicos, y cambiar cuál es el mapa
predeterminado es repuntarlos — no mover casi un giga.

Pasar un mapa a la raíz desde el editor mueve **las dos cosas que van juntas**:
la marca en la base y los enlaces. Si solo cambiara la base, el sitio seguiría
entregando el mapa anterior sin avisar. Publicar el mapa de la raíz también los
asegura, lo que cubre el primer despliegue y el caso de que alguien los borre.

```bash
cd apps/editor
npm run link-default        # por si hay que repuntarlos a mano
```

El editor vive bajo **`/admin`** del mismo dominio, así que Traefik enruta por
path y no hace falta un dominio ni un certificado más. **El mapa que estás
editando va en la URL**, no en una cookie:

```
/admin                        la lista de mapas
/admin/<slug>                 los medios de ese mapa
/admin/<slug>/medios/<id>     un medio
/admin/<slug>/apariencia
/admin/<slug>/publicar
```

Y el API igual: `/admin/api/maps/<slug>/media`. No saber sobre qué mapa estás
escribiendo es la falla que el aislamiento del adaptador existe para cerrar;
sería absurdo reintroducirla arriba.

El **nombre** de un mapa se edita desde el editor; la **ruta** no. El slug es la
URL que la gente comparte, así que cambiarlo es una operación de consola,
deliberada: mueve el directorio, la fila de la base y los enlaces de la raíz, y
si algo falla devuelve el directorio a su nombre sin tocar la base.

Los ids de medio son únicos en todo el sistema y no por mapa: son la clave que
referencian archivos, temas y cobertura, y el prefijo de cada id de nota
publicada (`<mediumId>-nota-3`). Si dos mapas tienen un medio del mismo nombre,
el segundo queda `canal-once-2`.

## Puesta en marcha

```bash
npm install
docker compose -f docker-compose.dev.yml up -d   # proyecto `mapa-dev`

# Esquema y base de pruebas
docker exec -i mapa-postgres-dev psql -U mapa -d mapa < packages/project-store/src/schema.sql
docker exec mapa-postgres-dev psql -U mapa -d postgres -c 'create database mapa_test owner mapa;'

cd apps/editor
cp .env.example .env
npm run import-legacy -- --file ../../datos/proyecto.json --map redmexico
# Obligatorio despues de importar: proyecto.json trae las rutas legacy, y los
# archivos en disco ya usan el esquema por id. Sin esto, publicar falla con
# los archivos "no encontrados" y tiene razon.
npm run migrate-paths -- --map redmexico --apply
npm run link-default
npm run create-user -- --email vos@aprende.gob.mx --name "Tu nombre"
npm run dev
```

## Comandos

```bash
npm test                    # todo el monorepo
npm run typecheck

cd apps/editor
npm run import-legacy       # migra datos/proyecto.json al catalogo
npm run migrate-paths       # rutas legacy -> rutas por id (informe; --apply)
                            # correr siempre despues de import-legacy
npm run link-default        # raiz del sitio -> mapa predeterminado
npm run rename-slug         # --from <slug> --to <slug>: cambia la URL publica
npm run verify-catalog      # regenera el mapa desde la base y lo resume
npm run export-catalog      # el catalogo como proyecto.json (--out, --sin-rutas)
npm run sweep               # archivos sin fila (informe; --delete)
                            # --all-maps para todos; retiene 90 dias
npm run create-user
npm run reset-password      # --email <correo> [--password-stdin]
```

Para ver el mapa publicado en local, igual que lo sirve nginx en producción:

```bash
node deploy/servir-publicado.mjs        # http://localhost:8080
```

Hace falta porque la página referencia `contenidos/` relativo a sí misma: en
producción nginx monta la multimedia dentro de su raíz, y abriendo el archivo
directamente el mapa carga sin un solo video.

## Publicar una entrega del sistema anterior

Mientras el editor no esté en producción, las entregas siguen llegando como
un zip generado por la herramienta PowerShell. Para subirlas:

```bash
./deploy/publicar-entrega.sh /mnt/c/Users/.../mapa-datos
```

Verifica que el HTML generado corresponda a `datos/proyecto.json` —si no, hay
que correr `ACTUALIZAR MAPA.bat` antes— y que cada testigo referenciado esté
presente. Después muestra **cuántos archivos se borrarían** y pide confirmación
escrita, porque el `rsync` lleva `--delete` sobre casi 1 GB.

El guion es autocontenido: no necesita el resto del repositorio, solo `bash`,
`rsync`, `python3` y acceso ssh. Copiarlo suelto a otra máquina alcanza.
Detecta qué flags soporta el `rsync` que encuentra, porque el de macOS es
2.6.9 hasta Sonoma y `--info=progress2` existe desde 3.1.0.

## Guardar y publicar son cosas distintas

Guardar escribe en la base y no toca el sitio. Publicar valida el catálogo
completo —los 32 estados, ids únicos, estados existentes y **cada archivo
referenciado presente en disco**— y recién entonces genera la página y la pone
en su lugar con un `rename`, que es atómico.

Si la validación falla no se tocó nada. El generador viejo validaba *después*
de haber escrito el JSON, movido los archivos y borrado los huérfanos, así que
un error dejaba el disco cambiado y el mapa publicado viejo.

Cada publicación queda registrada con los datos exactos que puso en la página,
así que volver atrás es republicar una versión anterior. Restaurar no modifica
el catálogo: volver atrás el sitio no es lo mismo que deshacer las ediciones de
alguien, y confundir las dos cosas pierde trabajo.

Las pruebas de humo verifican contra un servidor levantado lo que las unitarias
no pueden — cookies reales, subidas reales:

```bash
./scripts/smoke-auth.sh  <correo> <contraseña>
./scripts/smoke-crud.sh  <correo> <contraseña>
./scripts/smoke-files.sh <correo> <contraseña>
./scripts/smoke-publish.sh <correo> <contraseña>
./scripts/smoke-maps.sh  <correo> <contraseña>
```

**Los `scripts/` también se verifican.** Quedaban fuera del `typecheck` de Nuxt,
que solo mira `app/` y `server/`, y por eso el barrido de huérfanos sobrevivió a
un cambio de firma: perdió el argumento del mapa, dejó de ver referencias y
empezó a reportar los 66 archivos vivos como huérfanos —ofreciendo borrarlos—
mientras la prueba de humo pasaba, porque solo comprobaba que el archivo
*apareciera* en la lista.

## Comparar el catálogo contra un `proyecto.json` de la herramienta anterior

Quien venía editando en Windows tiene su último `proyecto.json` en local y
necesita confirmar que no quedó ningún dato afuera. `export-catalog` devuelve el
catálogo **en ese mismo formato**: `fromRows` ya produce un `Project`, que es lo
que ese archivo es. No hay traducción en el medio, y exportar un catálogo recién
importado devuelve un documento idéntico al original.

```bash
cd apps/editor
npm run export-catalog -- --map redmexico --out /tmp/servidor.json
```

Dos cosas hay que normalizar antes de comparar, o el diff es ruido:

```bash
# El orden de las claves --el proyecto.json de PowerShell trae otro-- y el
# orden de los medios, que no es significativo para esta comparación.
jq -S '.media |= sort_by(.id)' proyecto.json   > /tmp/a.json
jq -S '.media |= sort_by(.id)' /tmp/servidor.json > /tmp/b.json
diff /tmp/a.json /tmp/b.json
```

**Las rutas de archivo van a diferir, y eso es correcto.** El documento legacy
las derivaba del nombre del medio y en la base están bajo el esquema por id,
porque `migrate-paths` las reescribió a propósito. Un diff sin más muestra las
66 rutas como distintas y parece que falta todo:

```bash
npm run export-catalog -- --map redmexico --sin-rutas --out /tmp/servidor.json
```

Eso vacía `files[].file` y deja la comparación hablando de los datos: nombres,
notas, cobertura, temas de redes y el orden de los testigos.

El documento exportado también sirve como copia restaurable, pero **solo sobre
su propio mapa** (`import-legacy --map <el mismo> --force`). En otro mapa falla
con `media_pkey` duplicado, y está bien que falle: los ids de medio son únicos
en todo el sistema y no por mapa.

## Las subidas van por trozos

Un archivo no viaja en una sola petición. Va en trozos de 4 MiB, cada uno una
petición corta, y el servidor confirma cuántos bytes tiene después de cada una.

No es por el tamaño de los archivos. Es porque **una sola petición grande no
depende del archivo: depende de la conexión de quien sube**. Traefik v3 deja de
leer el cuerpo de una petición a los 60 segundos por omisión
—`respondingTimeouts.readTimeout`, y la documentación aclara que cubre el cuerpo
completo— así que el tamaño máximo real no era un tamaño, era *un tamaño por
cada velocidad de subida*:

| Subida de quien edita | Lo que entra en 60 s |
| --- | --- |
| 1 Mbps | 7,5 MB |
| 5 Mbps | 37 MB |
| 10 Mbps | 75 MB |
| 20 Mbps | 150 MB |

El mismo archivo entraba desde la oficina y fallaba desde una casa, y los
reportes llegaban sin ningún patrón porque el patrón estaba en la conexión de
cada persona. Encima, si el dominio pasa por Cloudflare, su tope por petición es
de 100 MB en los planes Free y Pro y responde 413 — y eso no está al alcance de
quien despliega esto.

Con trozos ningún pedido se acerca a ninguno de los dos límites, así que el
editor deja de depender de una infraestructura que no controla. Y de paso:

- Un corte de conexión se reintenta solo, desde donde quedó. Para quien sube, no
  pasó nada.
- Un reintento manual tampoco empieza de cero: le pregunta al servidor cuántos
  bytes tiene y sigue.
- Un archivo que el servidor no va a aceptar se rechaza **antes** de subir un
  kilobyte. Abrir la subida es una petición sin cuerpo, y ahí se contestan el
  415 y el 413 que antes llegaban a mitad de la transferencia.

**El estado de la subida es el archivo `.parcial`, y su tamaño es cuántos bytes
llegaron.** No hay fila, ni tabla, ni sesión en memoria. Eso descarta de entrada
la falla que vendría con cualquiera de las tres: que el contador y el disco digan
cosas distintas y el archivo se complete a un tamaño que nunca tuvo. El barrido
ya los recoge, porque no tienen fila que los referencie.

Y el invariante que sostiene todo: un trozo tiene que empezar **exactamente**
donde termina lo que hay. Si no, `409` con el número real y el cliente reanuda
desde ahí. Un `append` que aceptara el trozo igual duplicaría bytes ante
cualquier reintento, y el resultado es un video corrupto que en un listado de
directorio se ve perfectamente normal.

```
POST   /admin/api/maps/<slug>/media/<id>/uploads            abre; valida y no lleva bytes
PATCH  /admin/api/maps/<slug>/media/<id>/uploads/<up>       agrega un trozo en ?offset=
GET    /admin/api/maps/<slug>/media/<id>/uploads/<up>       cuántos bytes hay (reanudar)
POST   /admin/api/maps/<slug>/media/<id>/uploads/<up>/finish completa y da la fila
DELETE /admin/api/maps/<slug>/media/<id>/uploads/<up>       cancela y borra el .parcial
```

`PUT .../files` sigue existiendo para subir un archivo en una sola petición
desde un guion o con `curl`. El navegador no la usa, y la razón es sencilla: el
navegador es el que está detrás de los proxies.

Las URL de las subidas se construyen con `asset()` y no con `api()`. Son
peticiones de `XMLHttpRequest` —tráfico crudo, igual que un `src` de `<video>`—
así que nadie les agrega el prefijo `/admin`. Sin él no dan 404: dan un `302` a
la URL correcta, y el navegador manda el cuerpo entero a la URL que responde la
redirección **sin leerlo** para después mandarlo otra vez al destino real. El
archivo se subía dos veces y la barra de progreso seguía al primer intento, el
que el navegador abandona: se congelaba a mitad y no volvía a moverse.

## Los archivos borrados no desaparecen de inmediato

Quitar un archivo de un medio borra la fila y deja los bytes. Lo que eso protege
es que *la aplicación* borre lo que no debía —el editor anterior vaciaba
`contenidos/` en cada guardado ante un payload incompleto— y no es una función de
recuperación para quien edita: no hay forma de verlos ni restaurarlos desde la
interfaz.

Para que no crezcan sin techo, el barrido corre semanalmente en el servidor y
retiene **90 días**. Dos consecuencias que conviene tener presentes:

- La ventana de retención es **también la ventana de restauración**. Una versión
  del historial cuyos archivos ya se barrieron no se puede republicar: restaurar
  lo comprueba y se niega nombrando los que faltan.
- Las publicaciones anteriores a una migración de rutas tampoco se pueden
  restaurar. Los archivos existen, pero con otro nombre.

## Las referencias golden

`packages/map-generator/tests/fixtures/<aaaa-mm>/` guarda cada entrega real del
pipeline PowerShell: su `proyecto.json`, el `PROJECT_DATA` que quedó en la
página y la página completa. No se escriben a mano — son lo que produjo
producción, y son la definición de correcto.

Hay más de una a propósito. `2026-08` es la entrega contra la que se construyó
el port; `2026-10` llegó después y el generador la reprodujo exacta sin haberla
visto nunca. La primera prueba que el trabajo se hizo; la segunda, que se hizo
bien.

Cuando llegue otra entrega:

```bash
cd packages/map-generator
node scripts/extract-reference.mjs --entrega <carpeta> --nombre 2026-11
# y agregarla en tests/fixtures.ts
```

Las entregas que el mapa ya no publica se archivan en `archivo/<aaaa-mm>/`,
fuera de git por peso. **No es un respaldo: es la única copia**, porque publicar
el corte siguiente con `rsync --delete` las elimina de producción.

## El aislamiento entre mapas se prueba, no se supone

`packages/postgres/tests/isolation.integration.test.ts` pasa identificadores de
mapa ajenos a propósito y exige que la respuesta sea "no existe".

Mientras hubo un solo catálogo, "el mapa equivocado" no era un estado posible.
Con varios, cada consulta necesita su `map_id` — y la que se olvide **no falla**:
devuelve, edita o borra las filas del vecino, en silencio y con éxito aparente.

Esa suite encontró un bug real al escribirse. `setDefaultMap` desmarcaba el mapa
de la raíz y después intentaba marcar el nuevo; con un identificador inexistente
el primer `update` ya había corrido, el segundo no hacía nada, y la transacción
confirmaba igual porque no hubo error. El dominio quedaba sin ningún mapa que
servir en `/`.

Cuando toques una consulta de estas, rompé el `map_id` a mano y comprobá que la
suite se ponga roja. Verificado: quitarlo de cuatro funciones hace fallar ocho
pruebas.

## El despliegue

`DESPLIEGUE.md` tiene el procedimiento completo, incluido el **corte desde el
sitio subido a mano**. Lo verificado en local con Traefik, nginx y la imagen
reales:

| Ruta | Quién atiende | Cache-Control |
| --- | --- | --- |
| `/` | nginx → mapa predeterminado (por enlace) | `no-cache` |
| `/<slug>/` | nginx → ese mapa | `no-cache` |
| `/contenidos/…` | nginx → media (por enlace) | 30 días |
| `/admin/…` | el editor | — |

Las dos reglas de Traefik comparten host y se distinguen por prefijo, con
`priority` declarada en lugar de confiar en que ordene por longitud de regla: si
alguna vez empatan, el editor queda detrás del catch-all y deja de ser
alcanzable.

## Las pruebas de integración usan su propia base

Recrean el esquema en cada corrida. Apuntadas a la base de desarrollo la
destruyen en silencio, así que exigen un nombre terminado en `_test` y una
dirección de loopback. Si ves una suite salteada, el motivo aparece en el
mensaje.
