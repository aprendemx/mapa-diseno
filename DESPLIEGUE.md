# Despliegue

## Qué corre dónde

Un dominio, enrutado por path. Un solo certificado y ningún DNS nuevo por mapa.

| Ruta | Contenedor | Rol |
| --- | --- | --- |
| `/` | `mapa-publico` (nginx) | El mapa predeterminado |
| `/<slug>/` | `mapa-publico` | Cada mapa por su ruta |
| `/admin/` | `mapa-editor` (Nuxt) | El editor, con login |
| — | `mapa-postgres` | Base de datos, sin ruta desde afuera |

El editor escribe en `sitio/`; nginx lo lee montado como solo lectura. **Si el
editor se cae, los mapas siguen en línea** — ese es el motivo de que publicar
genere un archivo estático en lugar de renderizar al vuelo.

```
/opt/mapa-mexico/
├── docker-compose.yml
├── .env
├── mapa-base.html              ← la plantilla; se lee en cada publicación
├── deploy/{nginx.conf, respaldar.sh, restaurar.sh}
└── sitio/
    ├── index.html  -> redmexico/index.html      (el mapa de la raíz)
    ├── contenidos  -> redmexico/contenidos
    ├── redmexico/{index.html, contenidos/…}
    └── <otro-mapa>/{index.html, contenidos/…}
```

La raíz son **dos enlaces simbólicos**. La página referencia `contenidos/…`
relativo a sí misma, así que cada mapa en su directorio resuelve solo, y cambiar
cuál sirve la raíz cuesta dos renames en lugar de mover casi un giga.

## Corte desde el sitio subido a mano

Esto es lo delicado: hoy `sitio/` tiene `index.html` y `contenidos/` planos,
subidos con `rsync`. Hay que convertirlo en un mapa sin perder nada.

```bash
cd /opt/mapa-mexico

# 0. RESPALDAR PRIMERO. Es la única copia de la multimedia.
tar -cf /mnt/respaldos/antes-del-corte.tar sitio/

# 1. El contenido actual pasa a ser el mapa `redmexico`
mkdir -p sitio/redmexico
mv sitio/index.html sitio/contenidos sitio/redmexico/
ln -s redmexico/index.html sitio/index.html
ln -s redmexico/contenidos sitio/contenidos
sudo chown -R 1000:1000 sitio          # el editor corre como uid 1000

# 2. Comprobar que el sitio sigue sirviendo lo mismo ANTES de seguir
curl -sI -A 'Mozilla/5.0' https://mapa.aprende.gob.mx/ | head -1
```

Si el paso 2 no da `200`, parar y revisar los enlaces. El resto puede esperar.

```bash
# 3. Levantar la base y el editor
cp .env.example .env
$EDITOR .env                            # MAPA_HOST y POSTGRES_PASSWORD
docker build -f apps/editor/Dockerfile -t mapa-editor:$(date +%Y-%m-%d) .
$EDITOR .env                            # poner esa etiqueta en EDITOR_IMAGE
docker compose up -d postgres
docker exec -i mapa-postgres psql -U mapa -d mapa < packages/project-store/src/schema.sql

# 4. Importar el catálogo. Trae las rutas legacy, así que migrarlas después.
docker compose up -d editor
docker compose exec editor node scripts/import-legacy.ts \
  --file /plantilla/proyecto.json --map redmexico --name "Red México"
docker compose exec editor node scripts/migrate-paths.ts --map redmexico --apply
docker compose exec editor node scripts/create-user.ts \
  --email vos@aprende.gob.mx --name "Tu nombre"

# 5. El resto del stack
docker compose up -d
```

`migrate-paths` mueve los archivos dentro de `sitio/redmexico/` y reescribe las
rutas de la base. Informa antes de mover y verifica después que lo único que
cambió en el mapa generado fueron las rutas.

```bash
# 6. Publicar desde el editor y comparar
```

Entrá a `https://mapa.aprende.gob.mx/admin`, revisá y publicá. **Esa primera
publicación sobrescribe el `index.html` que subiste a mano.** Tiene que producir
la misma página: verificado en desarrollo contra la entrega real, idéntica byte a
byte fuera del bloque de datos, con las rutas de multimedia como única
diferencia — que es justo lo que `migrate-paths` cambió a propósito.

Si algo no cuadra, el respaldo del paso 0 restaura el estado anterior y el sitio
vuelve a servirse sin el editor.

## Actualizaciones

```bash
cd /opt/mapa-mexico
git pull
docker build -f apps/editor/Dockerfile -t mapa-editor:$(date +%Y-%m-%d) .
$EDITOR .env                    # actualizar EDITOR_IMAGE
docker compose up -d editor
```

Etiquetar por fecha y no usar `latest` es a propósito: volver atrás es cambiar
una línea del `.env` y levantar de nuevo.

## Cuentas

No hay registro abierto ni lo va a haber.

```bash
docker compose exec editor node scripts/create-user.ts \
  --email alguien@aprende.gob.mx --name "Nombre"
```

La contraseña se imprime una sola vez. No se puede **recuperar** —solo se guarda
su hash— pero sí reestablecer:

```bash
docker compose exec editor node scripts/reset-password.ts \
  --email alguien@aprende.gob.mx
```

Cierra todas las sesiones de esa cuenta: quien reestablece una contraseña o la
olvidó o sospecha que se filtró, y en los dos casos las sesiones abiertas
sobran.

## Respaldos

```bash
./deploy/respaldar.sh /mnt/respaldos
```

En cron, todos los días a las 3:

```
0 3 * * * cd /opt/mapa-mexico && ./deploy/respaldar.sh /mnt/respaldos >> /var/log/mapa-respaldo.log 2>&1
```

Respalda **las dos mitades juntas**: el volcado de la base y el árbol completo de
mapas. Un volcado que referencia archivos que no están respaldados no restaura
nada, y un archivo sin su fila es un huérfano que el barrido va a borrar.

Usa `--link-dest`, así que treinta respaldos de un giga ocupan un giga más lo que
haya cambiado. Y `-l`, para que los enlaces de la raíz vuelvan como enlaces: si
se copiaran como archivos, restaurar duplicaría la página en la raíz y repuntarla
dejaría de funcionar.

Para restaurar: `./deploy/restaurar.sh /mnt/respaldos/<fecha>`.

## Mantenimiento

```bash
docker compose exec editor node scripts/verify-catalog.ts --map redmexico
docker compose exec editor node scripts/sweep-orphans.ts --map redmexico
docker compose exec editor node scripts/link-default-map.ts
```

El barrido **por omisión solo informa**. Con `--delete` no toca nada más nuevo
que `--older-than` días, porque el huérfano más probable es un archivo recién
subido cuya fila todavía no llegó. Y se niega a seguir si el catálogo no
referencia ningún archivo habiendo archivos en disco: eso es una consulta mal
acotada, no un disco lleno de huérfanos.

## Cuando algo no responde

**El sitio da `404 page not found`.** Ese texto plano es de Traefik, no de nginx:
ningún router coincidió. Antes de revisar labels, mirá `docker ps`.

> **Traefik descarta los contenedores que Docker reporta `unhealthy`.** No les
> crea router y no lo dice en los logs a nivel INFO. Un healthcheck roto se ve
> exactamente igual que un dominio mal configurado.

Por eso los healthchecks de este compose usan `127.0.0.1` y no `localhost`: en
Alpine `localhost` puede resolver a `::1`, y con el config de nginx montado `:ro`
el script de entrypoint no puede agregar el `listen [::]:80`.

**`/admin` cae en el mapa en lugar del editor.** Las dos reglas comparten host y
se distinguen por prefijo. La del editor lleva `priority=100` y la de los mapas
`priority=1`, declaradas en lugar de confiar en que Traefik ordene por longitud
de regla: si alguna vez empatan, el editor queda detrás del catch-all y deja de
ser alcanzable.

**La raíz no entrega nada.** Faltan los enlaces simbólicos:

```bash
ls -l sitio/      # index.html y contenidos deben ser enlaces
docker compose exec editor node scripts/link-default-map.ts
```

**Un servicio nuevo no aparece aunque las labels estén bien.** Traefik lee Docker
a través de un proxy de socket sobre HAProxy. El stream de `/events` se corta por
timeout y Traefik deja de ver contenedores nuevos hasta que se reinicia.

```bash
docker restart traefik
```

Es un parche. La solución de fondo está en los timeouts del proxy.

**`curl` recibe 403 pero el navegador entra bien.** Es Cloudflare bloqueando el
User-Agent por omisión de curl. No dice nada del origen.

```bash
curl -sI -A 'Mozilla/5.0' https://mapa.aprende.gob.mx/ | head -1
```
