#!/usr/bin/env bash
# End-to-end check of the publish flow against a running dev server.
#
#   ./scripts/smoke-publish.sh <correo> <contrasena>
set -euo pipefail

BASE="${BASE:-http://localhost:3000/admin}"
MAPA="${MAPA:-redmexico}"
API="$BASE/api/maps/$MAPA"
ROOT="${ROOT:-../..}"
# Cada mapa tiene su arbol: su pagina y su multimedia juntas.
ARBOL="${ARBOL:-$ROOT/sitio/$MAPA}"
OUT="${OUT:-$ARBOL/index.html}"
EMAIL="${1:?uso: smoke-publish.sh <correo> <contrasena>}"
PASSWORD="${2:?uso: smoke-publish.sh <correo> <contrasena>}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

fail() { echo "  FALLO: $1" >&2; exit 1; }
api()  { curl -s -b "$JAR" -H 'content-type: application/json' "$@"; }
code() { curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -H 'content-type: application/json' "$@"; }

echo "0. publicar exige sesion"
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/publish")" = "401" ] \
  || fail "permitio publicar sin sesion"

curl -s -o /dev/null -c "$JAR" -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"

echo "1. la revision no encuentra problemas"
api "$API/publish-check" | grep -q '"ok": *true' || fail "la revision encontro problemas"

echo "2. publicar escribe la pagina"
rm -f "$OUT"
api -X POST "$API/publish" | grep -q '"publication"' || fail "no publico"
[ -f "$OUT" ] || fail "no escribio $OUT"

echo "3. la pagina publicada tiene los datos y el control de multimedia"
grep -q 'const PROJECT_DATA=' "$OUT" || fail "falta PROJECT_DATA"
[ "$(grep -c 'id="control-cierre-multimedia"' "$OUT")" = "1" ] || fail "el control no esta una sola vez"
# Se compara contra el catalogo vivo, no contra numeros fijos: cualquier otra
# prueba de humo que edite datos invalidaria una foto, y lo que importa aqui no
# es cuantos medios hay sino que lo publicado sea exactamente lo que hay.
ESPERADO=$(api "$API/media" | python3 -c '
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

echo "4. quedo registrado en el historial, con lo que hay"
# Contra el catalogo vivo y no contra un numero fijo: otra prueba de humo que
# edite datos invalidaria la foto, y ya paso una vez.
MEDIOS=$(api "$API/media" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["media"]))')
api "$API/publications" | python3 -c "
import json, sys
p = json.load(sys.stdin)['publications']
assert p, 'el historial quedo vacio'
assert p[0]['mediaCount'] == $MEDIOS, (p[0]['mediaCount'], $MEDIOS)
" || fail "el historial no refleja el catalogo"

echo "5. un archivo faltante bloquea la publicacion, sin tocar nada"
VICTIM=$(python3 -c "
import json,sys,urllib.request
" ; api "$API/media" | python3 -c 'import json,sys; print(json.load(sys.stdin)["media"][0]["id"])')
FPATH=$(api "$API/media/$VICTIM" | python3 -c 'import json,sys; print(json.load(sys.stdin)["medium"]["files"][0]["path"])')
mv "$ARBOL/$FPATH" "$ARBOL/$FPATH.escondido"

cp "$OUT" /tmp/publicado-antes.html
api "$API/publish-check" | grep -q '"ok": *false' || fail "la revision no vio el archivo faltante"
[ "$(code -X POST "$API/publish")" = "422" ] || fail "publico con un archivo faltante"
cmp -s "$OUT" /tmp/publicado-antes.html || fail "MODIFICO LA PAGINA pese a rechazar"
mv "$ARBOL/$FPATH.escondido" "$ARBOL/$FPATH"
rm -f /tmp/publicado-antes.html

echo "6. publicar sin cambios no agrega otra entrada al historial"
ANTES=$(api "$API/publications" | grep -c '"id"')
api -X POST "$API/publish" | grep -q '"unchanged": *true' \
  || fail "no detecto que no habia cambios"
DESPUES=$(api "$API/publications" | grep -c '"id"')
[ "$ANTES" = "$DESPUES" ] \
  || fail "el historial crecio sin cambios: $ANTES -> $DESPUES"

echo "7. cambiar algo, publicar, y restaurar la version anterior"
# Hace falta un cambio real entre las dos: con el deduplicado, publicar dos veces
# lo mismo deja una sola entrada --que es justamente lo que comprueba el paso 6.
MID=$(api "$API/media" | python3 -c 'import json,sys; print(json.load(sys.stdin)["media"][0]["id"])')
ORIGINAL=$(api "$API/media/$MID")
MODIFICADO=$(python3 -c "
import json, sys
m = json.loads(sys.argv[1])['medium']
m['notes'] = (m['notes'] + '\nNota agregada por la prueba de humo').strip()
print(json.dumps(m))" "$ORIGINAL")

api -X PUT "$API/media/$MID" -d "$MODIFICADO" >/dev/null
api -X POST "$API/publish" | grep -q '"unchanged": *false' || fail "no vio el cambio"

VIEJA=$(api "$API/publications" | python3 -c 'import json,sys; print(json.load(sys.stdin)["publications"][1]["id"])')
api -X POST "$API/publications/$VIEJA/restore" | grep -q '"publication"' || fail "no restauro"
api "$API/publications" | python3 -c '
import json,sys
p = json.load(sys.stdin)["publications"][0]
assert p["restoredFrom"], "la restauracion no quedo marcada"
' || fail "la restauracion no quedo marcada"

# Restaurar NO toca el catalogo: el cambio sigue en los datos del editor.
api "$API/media/$MID" | grep -q 'Nota agregada por la prueba de humo' \
  || fail "restaurar el sitio modifico el catalogo"

# Devolver el medio como estaba.
api -X PUT "$API/media/$MID" \
  -d "$(python3 -c "import json,sys; print(json.dumps(json.loads(sys.argv[1])['medium']))" "$ORIGINAL")" >/dev/null

echo "8. restaurar algo inexistente -> 404"
[ "$(code -X POST "$API/publications/00000000-0000-0000-0000-000000000000/restore")" = "404" ] \
  || fail "esperaba 404"

echo
echo "Publicacion correcta."
