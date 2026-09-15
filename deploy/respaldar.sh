#!/usr/bin/env bash
# Respalda el catalogo y la multimedia.
#
#   ./deploy/respaldar.sh [destino]        # por omision: ./respaldos
#
# Pensado para cron:
#   0 3 * * * cd /opt/mapa-mexico && ./deploy/respaldar.sh /mnt/respaldos >> /var/log/mapa-respaldo.log 2>&1
#
# El sistema anterior no respaldaba nada: `datos/Respaldo/proyecto_viejo.json`
# era una copia manual que ningun script leia, escribia ni rotaba.
#
# Las dos mitades van juntas a proposito. Un volcado de la base que referencia
# archivos que no estan respaldados no sirve para restaurar nada, y un archivo
# sin su fila es un huerfano que el barrido borrara.
set -euo pipefail

DESTINO="${1:-./respaldos}"
RETENER_DIAS="${RETENER_DIAS:-30}"
FECHA="$(date +%Y-%m-%d-%H%M)"
TRABAJO="$DESTINO/$FECHA"

cd "$(dirname "$0")/.."
[ -f .env ] || { echo "Falta .env" >&2; exit 1; }
set -a; . ./.env; set +a

mkdir -p "$TRABAJO"

echo "[$(date +%T)] volcando la base…"
docker exec -t mapa-postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom \
  > "$TRABAJO/catalogo.dump"

echo "[$(date +%T)] copiando multimedia…"
# --link-dest contra el respaldo anterior: los archivos que no cambiaron se
# enlazan en vez de copiarse, asi que treinta respaldos de 2.2 GB ocupan 2.2 GB
# mas lo que haya cambiado.
ANTERIOR="$(find "$DESTINO" -maxdepth 1 -mindepth 1 -type d ! -name "$FECHA" | sort | tail -1)"
if [ -n "$ANTERIOR" ] && [ -d "$ANTERIOR/contenidos" ]; then
  rsync -a --delete --link-dest="$ANTERIOR/contenidos" datos/contenidos/ "$TRABAJO/contenidos/"
else
  rsync -a --delete datos/contenidos/ "$TRABAJO/contenidos/"
fi

# La plantilla es codigo, pero si alguien la corrige en caliente el respaldo
# tiene que traerla; sin ella no se puede volver a publicar.
cp mapa-base.html "$TRABAJO/mapa-base.html"

echo "[$(date +%T)] verificando…"
[ -s "$TRABAJO/catalogo.dump" ] || { echo "El volcado quedo vacio." >&2; exit 1; }
FILAS=$(docker exec -t mapa-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
  'select count(*) from media_files' | tr -d '\r')
ARCHIVOS=$(find "$TRABAJO/contenidos" -type f ! -path '*/logos-redes/*' | wc -l)
echo "  filas de archivo en la base: $FILAS"
echo "  archivos respaldados:        $ARCHIVOS"
[ "$ARCHIVOS" -ge "$FILAS" ] || echo "  AVISO: hay menos archivos que filas. Revisar antes de confiar en este respaldo."

echo "[$(date +%T)] rotando respaldos de mas de $RETENER_DIAS dias…"
find "$DESTINO" -maxdepth 1 -mindepth 1 -type d -mtime "+$RETENER_DIAS" -exec rm -rf {} +

echo "[$(date +%T)] listo: $TRABAJO ($(du -sh "$TRABAJO" | cut -f1))"
