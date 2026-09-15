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
npm run verify-catalog      # regenera el mapa desde la base y lo resume
npm run sweep               # archivos sin fila (informe; --delete)
npm run create-user
```

Las pruebas de humo verifican contra un servidor levantado lo que las unitarias
no pueden — cookies reales, subidas reales:

```bash
./scripts/smoke-auth.sh  <correo> <contraseña>
./scripts/smoke-crud.sh  <correo> <contraseña>
./scripts/smoke-files.sh <correo> <contraseña>
```

## Las pruebas de integración usan su propia base

Recrean el esquema en cada corrida. Apuntadas a la base de desarrollo la
destruyen en silencio, así que exigen un nombre terminado en `_test` y una
dirección de loopback. Si ves una suite salteada, el motivo aparece en el
mensaje.
