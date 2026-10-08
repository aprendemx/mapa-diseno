#!/usr/bin/env bash
# End-to-end check of the upload lifecycle against a running dev server.
#
#   ./scripts/smoke-files.sh <correo> <contrasena>
set -euo pipefail

BASE="${BASE:-http://localhost:3000/admin}"
# La raiz del dominio, para probar URL absolutas como las de los <video src>.
BASE_RAIZ="${BASE_RAIZ:-${BASE%/admin}}"
# El slug del mapa de la raiz, no uno fijo: renombrarlo rompia estas pruebas.
MAPA="${MAPA:-}"
API=
ROOT="${ROOT:-../../sitio/$MAPA}"
EMAIL="${1:?uso: smoke-files.sh <correo> <contrasena>}"
PASSWORD="${2:?uso: smoke-files.sh <correo> <contrasena>}"
JAR="$(mktemp)"
TMP="$(mktemp -d)"
trap 'rm -rf "$JAR" "$TMP"' EXIT

fail() { echo "  FALLO: $1" >&2; exit 1; }
api()  { curl -s -b "$JAR" "$@"; }
code() { curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "$@"; }

curl -s -o /dev/null -c "$JAR" -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"

if [ -z "$MAPA" ]; then
  MAPA=$(curl -s -b "$JAR" "$BASE/api/maps" | python3 -c '
import json, sys
maps = json.load(sys.stdin)["maps"]
raiz = [m for m in maps if m["is_default"]] or maps
print(raiz[0]["slug"])')
fi
API="$BASE/api/maps/$MAPA"

MID=$(api "$API/media" | python3 -c 'import json,sys; print(json.load(sys.stdin)["media"][0]["id"])')
echo "medio de prueba: $MID"

head -c 300000 /dev/urandom > "$TMP/testigo de prueba.mp4"

echo "1. sin sesion no se puede subir"
[ "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$API/media/$MID/files?filename=x.mp4" --data-binary @"$TMP/testigo de prueba.mp4")" = "401" ] \
  || fail "permitio subir sin sesion"

echo "2. extension no admitida -> 415"
[ "$(code -X PUT "$API/media/$MID/files?filename=virus.exe" --data-binary @"$TMP/testigo de prueba.mp4")" = "415" ] \
  || fail "acepto un .exe"

echo "3. sin nombre de archivo -> 400"
[ "$(code -X PUT "$API/media/$MID/files" --data-binary @"$TMP/testigo de prueba.mp4")" = "400" ] \
  || fail "acepto una subida sin nombre"

echo "4. medio inexistente -> 404"
[ "$(code -X PUT "$API/media/no-existe/files?filename=a.mp4" --data-binary @"$TMP/testigo de prueba.mp4")" = "404" ] \
  || fail "acepto un medio inexistente"

echo "5. subida valida -> 201, ruta derivada del id"
RESP=$(api -X PUT "$API/media/$MID/files?filename=testigo%20de%20prueba.mp4" \
  --data-binary @"$TMP/testigo de prueba.mp4")
FID=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["file"]["id"])' "$RESP")
FPATH=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["file"]["path"])' "$RESP")
BYTES=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["file"]["bytes"])' "$RESP")

[ "$BYTES" = "300000" ] || fail "tamano reportado incorrecto: $BYTES"
[ "$FPATH" = "contenidos/$MID/$FID-testigo-de-prueba.mp4" ] || fail "ruta inesperada: $FPATH"
python3 -c 'import json,sys; assert json.loads(sys.argv[1])["file"]["kind"]=="video"' "$RESP" \
  || fail "no lo clasifico como video"

echo "6. los bytes estan en disco, completos"
[ "$(stat -c%s "$ROOT/$FPATH")" = "300000" ] || fail "el archivo en disco no coincide"

echo "7. aparece en el detalle, y su preview carga con el prefijo de la app"
# El <video src> es una peticion cruda del navegador: no pasa por $fetch y nadie
# le agrega el prefijo. Sin el, se va a la raiz del dominio y da 404.
PAGINA=$(api "$BASE/$MAPA/medios/$MID")
SRC=$(grep -oE 'src="[^"]*files/contenidos[^"]*"' <<<"$PAGINA" | head -1 | sed 's/src="//;s/"$//')
[ -n "$SRC" ] || fail "la pagina no rindio el preview (redirigio?)"
case "$SRC" in
  /admin/api/*) ;;
  *) fail "el src del preview no lleva el prefijo de la app: $SRC" ;;
esac
[ "$(code "$BASE_RAIZ$SRC")" = "200" ] || fail "el preview no carga: $SRC"
api "$API/media/$MID" | grep -q "$FID" || fail "no aparece en el detalle"

echo "8. la descripcion se guarda"
api -X PATCH "$API/media/$MID/files/$FID" -H 'content-type: application/json' \
  -d '{"description":"Testigo de prueba"}' >/dev/null
api "$API/media/$MID" | grep -q 'Testigo de prueba' || fail "no guardo la descripcion"

echo "9. reordenar lo lleva al principio"
IDS=$(api "$API/media/$MID" | python3 -c "
import json,sys
m=json.load(sys.stdin)['medium']
w=[(f['position'],f['id']) for f in m['files']]+[(t['position'],t['id']) for t in m['socialThemes']]
ids=[i for _,i in sorted(w)]
ids.remove('$FID'); ids.insert(0,'$FID')
print(json.dumps({'ids':ids}))")
api -X PUT "$API/media/$MID/witness-order" -H 'content-type: application/json' -d "$IDS" >/dev/null
api "$API/media/$MID" | python3 -c "
import json,sys
m=json.load(sys.stdin)['medium']
w=[(f['position'],f['id']) for f in m['files']]+[(t['position'],t['id']) for t in m['socialThemes']]
assert sorted(w)[0][1]=='$FID', sorted(w)[:3]
assert [p for p,_ in sorted(w)]==list(range(1,len(w)+1)), 'posiciones con huecos'
" || fail "no quedo primero, o quedaron huecos"

echo "10. quitarlo borra la fila pero NO los bytes"
api -X DELETE "$API/media/$MID/files/$FID" >/dev/null
api "$API/media/$MID" | grep -q "$FID" && fail "sigue en el detalle"
[ -f "$ROOT/$FPATH" ] || fail "BORRO EL ARCHIVO DEL DISCO"

echo "11. el barrido reporta exactamente un huerfano, y es ese"
# El numero exacto, no la mera aparicion: un barrido que lista TODO tambien
# contiene este id, y una vez dejo pasar justamente eso.
BARRIDO=$(NUXT_DATABASE_URL="${NUXT_DATABASE_URL:-postgres://mapa:mapa_dev@127.0.0.1:5432/mapa}" \
  node scripts/sweep-orphans.ts --root "$ROOT" --map "$MAPA")
grep -q "$FID" <<<"$BARRIDO" || fail "el barrido no lo vio"
grep -qE '^1 huerfano' <<<"$BARRIDO" \
  || fail "esperaba exactamente 1 huerfano: $(grep huerfano <<<"$BARRIDO")"

rm -f "$ROOT/$FPATH"

# ---------------------------------------------------------------------------
# Subida por trozos
#
# La de una sola peticion de arriba sigue existiendo para los guiones, pero el
# navegador usa esta: Traefik deja de leer un cuerpo a los 60 s por omision y
# Cloudflare rechaza cualquiera de mas de 100 MB, asi que un archivo entero en
# una peticion no es una apuesta sobre su tamano sino sobre la velocidad de
# subida de cada persona.
#
# Lo que se verifica aca son los numeros, no que las peticiones devuelvan algo.
# El modo en que esto falla de verdad es aceptando bytes que no corresponden, y
# un video con un trozo duplicado se ve perfecto en un listado de directorio.
# ---------------------------------------------------------------------------
echo
echo "--- subida por trozos ---"

UP="$API/media/$MID/uploads"
jq_field() { python3 -c 'import json,sys; print(json.loads(sys.argv[1])[sys.argv[2]])' "$1" "$2"; }
jq_data()  { python3 -c 'import json,sys; print(json.loads(sys.argv[1])["data"][sys.argv[2]])' "$1" "$2"; }

echo "12. sin sesion no se puede abrir una subida"
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$UP?filename=a.mp4&bytes=10")" = "401" ] \
  || fail "permitio abrir una subida sin sesion"

# Las tres negativas que siguen son el punto de que abrir la subida sea una
# peticion aparte: se rechaza ANTES de gastarle la subida a nadie. Antes el
# .exe y el archivo demasiado grande se descubrian a mitad de la transferencia.
echo "13. extension no admitida -> 415, sin mandar un byte"
[ "$(code -X POST "$UP?filename=virus.exe&bytes=10")" = "415" ] || fail "acepto un .exe"

echo "14. tamano por encima del tope -> 413"
[ "$(code -X POST "$UP?filename=a.mp4&bytes=99999999999999")" = "413" ] \
  || fail "acepto un tamano por encima del tope"

echo "15. sin tamano declarado -> 400"
[ "$(code -X POST "$UP?filename=a.mp4")" = "400" ] || fail "acepto una subida sin tamano"

# El id vuelve desde el cliente en cada trozo, y de el sale la ruta en disco.
echo "16. identificador de subida invalido -> 400"
[ "$(code "$UP/no-es-un-id?filename=a.mp4")" = "400" ] \
  || fail "acepto un identificador de subida arbitrario"

echo "17. abrir una subida -> 201 con uploadId y chunkBytes"
ABRE=$(api -X POST "$UP?filename=entrega%20grande.mp4&bytes=300000")
UID_=$(jq_field "$ABRE" uploadId)
CHUNK=$(jq_field "$ABRE" chunkBytes)
[ -n "$UID_" ] || fail "no devolvio uploadId"
[ "$CHUNK" -gt 0 ] 2>/dev/null || fail "chunkBytes no es un numero positivo: $CHUNK"
echo "    uploadId=$UID_ chunkBytes=$CHUNK"

Q="filename=entrega%20grande.mp4"
head -c 100000 "$TMP/testigo de prueba.mp4" > "$TMP/c1"
tail -c +100001 "$TMP/testigo de prueba.mp4" > "$TMP/c2"

echo "18. una subida que no empezo reporta 0 bytes"
[ "$(jq_field "$(api "$UP/$UID_?$Q")" received)" = "0" ] || fail "no reporto 0 bytes"

echo "19. primer trozo -> el servidor confirma 100000"
R1=$(api -X PATCH "$UP/$UID_?$Q&offset=0" --data-binary @"$TMP/c1")
[ "$(jq_field "$R1" received)" = "100000" ] || fail "confirmo mal el primer trozo: $R1"

# El corazon del diseño. Sin esta negativa un reintento de red duplica bytes y
# el archivo queda corrupto con un tamaño que ya no corresponde a su contenido.
echo "20. repetir el trozo -> 409 con los bytes reales, y NO duplica"
R2=$(api -X PATCH "$UP/$UID_?$Q&offset=0" --data-binary @"$TMP/c1")
[ "$(jq_data "$R2" received)" = "100000" ] || fail "el 409 no dijo cuantos bytes hay: $R2"
[ "$(jq_field "$(api "$UP/$UID_?$Q")" received)" = "100000" ] \
  || fail "DUPLICO BYTES al repetir un trozo"

echo "21. un trozo que deja un hueco -> 409"
[ "$(code -X PATCH "$UP/$UID_?$Q&offset=999999" --data-binary @"$TMP/c2")" = "409" ] \
  || fail "acepto un trozo con hueco"

# Sin esta negativa, una subida sin su ultimo trozo se completa igual: el
# archivo existe, tiene su fila, y el mapa publica un video truncado que el
# navegador corta a mitad sin un error en ninguna parte.
echo "22. completar incompleta -> 409, y el archivo NO se crea"
R3=$(api -X POST "$UP/$UID_/finish?$Q&bytes=300000")
[ "$(jq_data "$R3" received)" = "100000" ] || fail "el 409 de completar no dijo cuanto hay: $R3"
[ ! -f "$ROOT/contenidos/$MID/$UID_-entrega-grande.mp4" ] \
  || fail "CREO EL ARCHIVO con una subida incompleta"

echo "23. segundo trozo y completar -> 201 con los bytes exactos"
api -X PATCH "$UP/$UID_?$Q&offset=100000" --data-binary @"$TMP/c2" >/dev/null
FIN=$(api -X POST "$UP/$UID_/finish?$Q&bytes=300000")
UPATH=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["file"]["path"])' "$FIN")
UBYTES=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["file"]["bytes"])' "$FIN")
[ "$UBYTES" = "300000" ] || fail "tamano reportado incorrecto: $UBYTES"
[ "$UPATH" = "contenidos/$MID/$UID_-entrega-grande.mp4" ] || fail "ruta inesperada: $UPATH"

echo "24. los bytes en disco son los del original, byte a byte"
[ "$(stat -c%s "$ROOT/$UPATH" 2>/dev/null || stat -f%z "$ROOT/$UPATH")" = "300000" ] \
  || fail "el archivo en disco no coincide"
cmp -s "$TMP/testigo de prueba.mp4" "$ROOT/$UPATH" \
  || fail "EL CONTENIDO NO COINCIDE: los trozos se armaron mal"

echo "25. ya no queda ningun .parcial"
[ ! -f "$ROOT/$UPATH.parcial" ] || fail "quedo un .parcial despues de completar"

echo "26. cancelar se lleva los bytes a medias"
CANCELA=$(api -X POST "$UP?filename=cancelada.mp4&bytes=300000")
CID=$(jq_field "$CANCELA" uploadId)
api -X PATCH "$UP/$CID?filename=cancelada.mp4&offset=0" --data-binary @"$TMP/c1" >/dev/null
[ -f "$ROOT/contenidos/$MID/$CID-cancelada.mp4.parcial" ] || fail "no escribio el .parcial"
[ "$(code -X DELETE "$UP/$CID?filename=cancelada.mp4")" = "204" ] || fail "cancelar no devolvio 204"
[ ! -f "$ROOT/contenidos/$MID/$CID-cancelada.mp4.parcial" ] \
  || fail "cancelar dejo los bytes en disco"

echo "27. limpieza: quitar el archivo subido por trozos"
api -X DELETE "$API/media/$MID/files/$UID_" >/dev/null
rm -f "$ROOT/$UPATH"

echo
echo "Ciclo de archivos correcto."
