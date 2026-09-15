#!/usr/bin/env bash
# Restaura un respaldo hecho con respaldar.sh.
#
#   ./deploy/restaurar.sh /mnt/respaldos/2026-09-15-0300
#
# Destruye el catalogo actual. Pide confirmacion escrita porque no hay vuelta
# atras y porque una restauracion se hace, por definicion, un dia malo.
set -euo pipefail

ORIGEN="${1:?uso: restaurar.sh <directorio-de-respaldo>}"
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "Falta .env" >&2; exit 1; }
set -a; . ./.env; set +a

[ -f "$ORIGEN/catalogo.dump" ] || { echo "No hay catalogo.dump en $ORIGEN" >&2; exit 1; }
[ -d "$ORIGEN/contenidos" ]    || { echo "No hay contenidos/ en $ORIGEN" >&2; exit 1; }

echo "Esto reemplaza el catalogo y la multimedia actuales por los de:"
echo "  $ORIGEN"
read -r -p "Escribi RESTAURAR para continuar: " respuesta
[ "$respuesta" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

echo "deteniendo el editor para que nadie escriba a mitad…"
docker compose stop editor

docker exec -i mapa-postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --clean --if-exists < "$ORIGEN/catalogo.dump"
rsync -a --delete "$ORIGEN/contenidos/" datos/contenidos/
[ -f "$ORIGEN/mapa-base.html" ] && cp "$ORIGEN/mapa-base.html" mapa-base.html

docker compose start editor
echo
echo "Restaurado. El mapa publicado NO cambio todavia: entra al editor y publica"
echo "para que el sitio refleje este catalogo."
