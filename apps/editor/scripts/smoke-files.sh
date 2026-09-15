#!/usr/bin/env bash
# End-to-end check of the upload lifecycle against a running dev server.
#
#   ./scripts/smoke-files.sh <correo> <contrasena>
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
ROOT="${ROOT:-../..}"
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

MID=$(api "$BASE/api/media" | python3 -c 'import json,sys; print(json.load(sys.stdin)["media"][0]["id"])')
echo "medio de prueba: $MID"

head -c 300000 /dev/urandom > "$TMP/testigo de prueba.mp4"

echo "1. sin sesion no se puede subir"
[ "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/media/$MID/files?filename=x.mp4" --data-binary @"$TMP/testigo de prueba.mp4")" = "401" ] \
  || fail "permitio subir sin sesion"

echo "2. extension no admitida -> 415"
[ "$(code -X PUT "$BASE/api/media/$MID/files?filename=virus.exe" --data-binary @"$TMP/testigo de prueba.mp4")" = "415" ] \
  || fail "acepto un .exe"

echo "3. sin nombre de archivo -> 400"
[ "$(code -X PUT "$BASE/api/media/$MID/files" --data-binary @"$TMP/testigo de prueba.mp4")" = "400" ] \
  || fail "acepto una subida sin nombre"

echo "4. medio inexistente -> 404"
[ "$(code -X PUT "$BASE/api/media/no-existe/files?filename=a.mp4" --data-binary @"$TMP/testigo de prueba.mp4")" = "404" ] \
  || fail "acepto un medio inexistente"

echo "5. subida valida -> 201, ruta derivada del id"
RESP=$(api -X PUT "$BASE/api/media/$MID/files?filename=testigo%20de%20prueba.mp4" \
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

echo "7. aparece en el detalle del medio"
api "$BASE/api/media/$MID" | grep -q "$FID" || fail "no aparece en el detalle"

echo "8. la descripcion se guarda"
api -X PATCH "$BASE/api/media/$MID/files/$FID" -H 'content-type: application/json' \
  -d '{"description":"Testigo de prueba"}' >/dev/null
api "$BASE/api/media/$MID" | grep -q 'Testigo de prueba' || fail "no guardo la descripcion"

echo "9. reordenar lo lleva al principio"
IDS=$(api "$BASE/api/media/$MID" | python3 -c "
import json,sys
m=json.load(sys.stdin)['medium']
w=[(f['position'],f['id']) for f in m['files']]+[(t['position'],t['id']) for t in m['socialThemes']]
ids=[i for _,i in sorted(w)]
ids.remove('$FID'); ids.insert(0,'$FID')
print(json.dumps({'ids':ids}))")
api -X PUT "$BASE/api/media/$MID/witness-order" -H 'content-type: application/json' -d "$IDS" >/dev/null
api "$BASE/api/media/$MID" | python3 -c "
import json,sys
m=json.load(sys.stdin)['medium']
w=[(f['position'],f['id']) for f in m['files']]+[(t['position'],t['id']) for t in m['socialThemes']]
assert sorted(w)[0][1]=='$FID', sorted(w)[:3]
assert [p for p,_ in sorted(w)]==list(range(1,len(w)+1)), 'posiciones con huecos'
" || fail "no quedo primero, o quedaron huecos"

echo "10. quitarlo borra la fila pero NO los bytes"
api -X DELETE "$BASE/api/media/$MID/files/$FID" >/dev/null
api "$BASE/api/media/$MID" | grep -q "$FID" && fail "sigue en el detalle"
[ -f "$ROOT/$FPATH" ] || fail "BORRO EL ARCHIVO DEL DISCO"

echo "11. el barrido lo reporta como huerfano"
NUXT_DATABASE_URL="${NUXT_DATABASE_URL:-postgres://mapa:mapa_dev@127.0.0.1:5432/mapa}" \
  node scripts/sweep-orphans.ts --root "$ROOT" | grep -q "$FID" || fail "el barrido no lo vio"

rm -f "$ROOT/$FPATH"
echo
echo "Ciclo de archivos correcto."
