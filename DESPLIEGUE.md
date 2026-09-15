# Despliegue

## Qué corre dónde

| Dominio | Contenedor | Rol |
| --- | --- | --- |
| `mapa.…` | `mapa-publico` (nginx) | Sitio público, solo lectura |
| `editor.mapa.…` | `mapa-editor` (Nuxt) | Editor con login |
| — | `mapa-postgres` | Base de datos, sin ruta desde afuera |

El editor escribe en `datos/`; nginx lo lee montado como solo lectura. **Si el
editor se cae, el mapa público sigue en línea** — esa es la razón de que
publicar genere un archivo estático en vez de renderizar al vuelo.

```
/opt/mapa-mexico/
├── docker-compose.yml
├── .env
├── mapa-base.html          ← la plantilla; se lee en cada publicación
├── deploy/
│   ├── nginx.conf
│   ├── respaldar.sh
│   └── restaurar.sh
└── datos/
    ├── contenidos/         ← multimedia, ~2.2 GB
    └── publicado/          ← index.html generado
```

## Primer despliegue

```bash
# 1. Preparar el directorio. El editor corre como uid 1000 y necesita escribir.
sudo mkdir -p /opt/mapa-mexico/datos/{contenidos,publicado}
sudo chown -R 1000:1000 /opt/mapa-mexico/datos
sudo chown -R $USER:$USER /opt/mapa-mexico

# 2. Subir el proyecto (sin node_modules, sin contenidos: van aparte)
rsync -av --exclude node_modules --exclude .git --exclude datos \
  ./ usuario@servidor:/opt/mapa-mexico/

# 3. Subir la multimedia. Sin -z: los mp4 ya están comprimidos.
rsync -av --partial --info=progress2 \
  contenidos/ usuario@servidor:/opt/mapa-mexico/datos/contenidos/

# 4. Configurar
cd /opt/mapa-mexico
cp .env.example .env
$EDITOR .env          # dominios y POSTGRES_PASSWORD (openssl rand -base64 30)

# 5. Construir la imagen del editor
docker build -f apps/editor/Dockerfile -t mapa-editor:$(date +%Y-%m-%d) .
# …y poner esa etiqueta en EDITOR_IMAGE dentro de .env

# 6. Levantar
docker compose up -d

# 7. Crear el esquema y la primera cuenta
docker exec -i mapa-postgres psql -U mapa -d mapa < packages/project-store/src/schema.sql
docker compose exec editor node -e "…"   # ver "Cuentas" más abajo

# 8. Importar el catálogo y publicar
#    Desde el editor, en el navegador: revisar → publicar.
```

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

No hay registro abierto ni lo va a haber. Las cuentas se crean desde el
servidor:

```bash
docker compose exec editor node scripts/create-user.ts \
  --email alguien@aprende.gob.mx --name "Nombre"
```

La contraseña se imprime una sola vez. No se puede recuperar: solo se guarda su
hash.

## Respaldos

```bash
./deploy/respaldar.sh /mnt/respaldos
```

En cron, todos los días a las 3:

```
0 3 * * * cd /opt/mapa-mexico && ./deploy/respaldar.sh /mnt/respaldos >> /var/log/mapa-respaldo.log 2>&1
```

Respalda **las dos mitades juntas**: el volcado de la base y la multimedia. Un
volcado que referencia archivos que no están respaldados no restaura nada, y un
archivo sin su fila es un huérfano que el barrido va a borrar.

Usa `--link-dest`, así que treinta respaldos de 2.2 GB ocupan 2.2 GB más lo que
haya cambiado.

Para restaurar: `./deploy/restaurar.sh /mnt/respaldos/<fecha>`. El mapa
publicado no cambia solo — hay que entrar al editor y publicar.

## Cuando algo no responde

**El sitio da `404 page not found`.** Ese texto plano es de Traefik, no de
nginx: significa que ningún router coincidió. Antes de revisar labels, mirá
`docker ps`.

> **Traefik descarta los contenedores que Docker reporta `unhealthy`.** No les
> crea router y no lo dice en los logs a nivel INFO. Un healthcheck roto se ve
> exactamente igual que un dominio mal configurado.

Por eso los healthchecks de este compose usan `127.0.0.1` y no `localhost`: en
Alpine `localhost` puede resolver a `::1`, y con el config de nginx montado
`:ro` el script de entrypoint no puede agregar el `listen [::]:80`.

**Un servicio nuevo no aparece aunque las labels estén bien.** Traefik lee
Docker a través de un proxy de socket sobre HAProxy. El stream de `/events` es
una conexión de larga duración y se corta por timeout; Traefik deja de ver
contenedores nuevos hasta que se reinicia.

```bash
docker restart traefik
```

Es un parche. La solución de fondo está en los timeouts del proxy.

**`curl` recibe 403 pero el navegador entra bien.** Es Cloudflare bloqueando el
User-Agent por omisión de curl. No dice nada del origen.

```bash
curl -sI -A 'Mozilla/5.0' https://mapa.redmexico.aprende.gob.mx/
```

**Ver qué router atendió una petición.** El penúltimo campo del access log de
Traefik lo dice; `"-"` significa que ninguno coincidió.
