#!/usr/bin/env bash
# End-to-end check of the publish flow against a running dev server.
#
#   ./scripts/smoke-publish.sh <correo> <contrasena>
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
ROOT="${ROOT:-../..}"
OUT="${OUT:-$ROOT/publicado/index.html}"
EMAIL="${1:?uso: smoke-publish.sh <correo> <contrasena>}"
PASSWORD="${2:?uso: smoke-publish.sh <correo> <contrasena>}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

fail() { echo "  FALLO: $1" >&2; exit 1; }
api()  { curl -s -b "$JAR" -H 'content-type: application/json' "$@"; }
code() { curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -H 'content-type: application/json' "$@"; }

echo "0. publicar exige sesion"
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/publish")" = "401" ] \
  || fail "permitio publicar sin sesion"

curl -s -o /dev/null -c "$JAR" -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"

echo "1. la revision no encuentra problemas"
api "$BASE/api/publish-check" | grep -q '"ok": *true' || fail "la revision encontro problemas"

echo "2. publicar escribe la pagina"
rm -f "$OUT"
api -X POST "$BASE/api/publish" | grep -q '"publication"' || fail "no publico"
[ -f "$OUT" ] || fail "no escribio $OUT"

echo "3. la pagina publicada tiene los datos y el control de multimedia"
grep -q 'const PROJECT_DATA=' "$OUT" || fail "falta PROJECT_DATA"
[ "$(grep -c 'id="control-cierre-multimedia"' "$OUT")" = "1" ] || fail "el control no esta una sola vez"
# Se compara contra el catalogo vivo, no contra numeros fijos: cualquier otra
# prueba de humo que edite datos invalidaria una foto, y lo que importa aqui no
# es cuantos medios hay sino que lo publicado sea exactamente lo que hay.
ESPERADO=$(api "$BASE/api/media" | python3 -c '
import json, sys
m = json.load(sys.stdin)["media"]
print(json.dumps({
    "media": len(m),
    "notas": sum(x["noteCount"] for x in m),
    "testigos": sum(x["fileCount"] + x["themeCount"] for x in m),
}))')

python3 - "$OUT" "$ESPERADO" <<'CHECK'
import json, re, sys
html = open(sys.argv[1], encoding='utf-8').read()
block = re.search(r'/\*__DATOS_GENERADOS_INICIO__\*/(.*?)/\*__DATOS_GENERADOS_FIN__\*/', html, re.S).group(1)
data = json.loads(re.search(r'const PROJECT_DATA=(\{.*\});', block, re.S).group(1))
esperado = json.loads(sys.argv[2])

assert len(data['states']) == 32, len(data['states'])
assert len(data['media']) == esperado['media'], (len(data['media']), esperado['media'])
assert len(data['campaigns']) == esperado['notas'], (len(data['campaigns']), esperado['notas'])
# Los testigos publicados son un subconjunto: los temas de un medio con las
# redes apagadas, y los que no tienen ningun link, no llegan al mapa.
assert len(data['contents']) <= esperado['testigos'], (len(data['contents']), esperado['testigos'])
assert len(data['contents']) > 0
CHECK
[ $? -eq 0 ] || fail "el contenido publicado no coincide con el catalogo"

echo "4. quedo registrado en el historial"
api "$BASE/api/publications" | grep -q '"mediaCount": *29' || fail "no quedo en el historial"

echo "5. un archivo faltante bloquea la publicacion, sin tocar nada"
VICTIM=$(python3 -c "
import json,sys,urllib.request
" ; api "$BASE/api/media" | python3 -c 'import json,sys; print(json.load(sys.stdin)["media"][0]["id"])')
FPATH=$(api "$BASE/api/media/$VICTIM" | python3 -c 'import json,sys; print(json.load(sys.stdin)["medium"]["files"][0]["path"])')
mv "$ROOT/$FPATH" "$ROOT/$FPATH.escondido"

cp "$OUT" /tmp/publicado-antes.html
api "$BASE/api/publish-check" | grep -q '"ok": *false' || fail "la revision no vio el archivo faltante"
[ "$(code -X POST "$BASE/api/publish")" = "422" ] || fail "publico con un archivo faltante"
cmp -s "$OUT" /tmp/publicado-antes.html || fail "MODIFICO LA PAGINA pese a rechazar"
mv "$ROOT/$FPATH.escondido" "$ROOT/$FPATH"
rm -f /tmp/publicado-antes.html

echo "6. publicar de nuevo y restaurar la version anterior"
api -X POST "$BASE/api/publish" >/dev/null
OLD=$(api "$BASE/api/publications" | python3 -c 'import json,sys; print(json.load(sys.stdin)["publications"][1]["id"])')
api -X POST "$BASE/api/publications/$OLD/restore" | grep -q '"publication"' || fail "no restauro"
api "$BASE/api/publications" | python3 -c '
import json,sys
p = json.load(sys.stdin)["publications"][0]
assert p["restoredFrom"], "la restauracion no quedo marcada"
' || fail "la restauracion no quedo marcada"

echo "7. restaurar algo inexistente -> 404"
[ "$(code -X POST "$BASE/api/publications/00000000-0000-0000-0000-000000000000/restore")" = "404" ] \
  || fail "esperaba 404"

echo
echo "Publicacion correcta."
