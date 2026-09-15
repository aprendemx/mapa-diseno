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

## Puesta en marcha

```bash
npm install
docker compose -f docker-compose.dev.yml up -d

# Esquema y base de pruebas
docker exec -i mapa-postgres-dev psql -U mapa -d mapa < packages/project-store/src/schema.sql
docker exec mapa-postgres-dev psql -U mapa -d postgres -c 'create database mapa_test owner mapa;'

cd apps/editor
cp .env.example .env
npm run import-legacy -- --file ../../datos/proyecto.json
# Obligatorio despues de importar: proyecto.json trae las rutas legacy, y los
# archivos en disco ya usan el esquema por id. Sin esto, publicar falla con
# 158 archivos "no encontrados" y tiene razon.
npm run migrate-paths -- --apply
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
npm run verify-catalog      # regenera el mapa desde la base y lo resume
npm run sweep               # archivos sin fila (informe; --delete)
npm run create-user
```

Para ver el mapa publicado en local, igual que lo sirve nginx en producción:

```bash
node deploy/servir-publicado.mjs        # http://localhost:8080
```

Hace falta porque la página referencia `contenidos/` relativo a sí misma: en
producción nginx monta la multimedia dentro de su raíz, y abriendo el archivo
directamente el mapa carga sin un solo video.

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
```

## Las pruebas de integración usan su propia base

Recrean el esquema en cada corrida. Apuntadas a la base de desarrollo la
destruyen en silencio, así que exigen un nombre terminado en `_test` y una
dirección de loopback. Si ves una suite salteada, el motivo aparece en el
mensaje.
