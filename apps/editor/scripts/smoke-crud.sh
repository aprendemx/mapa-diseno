#!/usr/bin/env bash
# End-to-end check of the catalogue endpoints against a running dev server.
#
#   ./scripts/smoke-crud.sh <correo> <contrasena>
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
EMAIL="${1:?uso: smoke-crud.sh <correo> <contrasena>}"
PASSWORD="${2:?uso: smoke-crud.sh <correo> <contrasena>}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

fail() { echo "  FALLO: $1" >&2; exit 1; }
api()  { curl -s -b "$JAR" -H 'content-type: application/json' "$@"; }
code() { curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -H 'content-type: application/json' "$@"; }

echo "0. sin sesion, el catalogo responde 401"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/media")" = "401" ] \
  || fail "el catalogo deberia exigir sesion"

curl -s -o /dev/null -c "$JAR" -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"

echo "1. lista 29 medios y 32 estados"
[ "$(api "$BASE/api/media" | grep -o '"id"' | wc -l)" -ge 29 ] || fail "faltan medios"
[ "$(api "$BASE/api/states" | grep -o '"id"' | wc -l)" = "32" ] || fail "no son 32 estados"

ID=$(api "$BASE/api/media" | python3 -c 'import json,sys; print(json.load(sys.stdin)["media"][0]["id"])')
echo "   primer medio: $ID"

echo "2. el detalle trae cobertura, temas y archivos"
api "$BASE/api/media/$ID" | python3 -c '
import json,sys
m = json.load(sys.stdin)["medium"]
for key in ("coverageStates","socialThemes","files","notes","coverageText"):
    assert key in m, f"falta {key}"
' || fail "el detalle esta incompleto"

echo "3. un medio inexistente responde 404"
[ "$(code "$BASE/api/media/no-existe")" = "404" ] || fail "esperaba 404"

echo "4. nombre vacio -> 422 con el campo señalado"
resp=$(api -X PUT "$BASE/api/media/$ID" -d '{"name":"   ","stateId":"","coverageStates":[],"socialThemes":[]}')
grep -q '"field": *"name"' <<<"$resp" || fail "no señalo el campo name: $resp"

echo "5. link javascript: -> 422"
resp=$(api -X PUT "$BASE/api/media/$ID" -d '{"name":"Prueba","stateId":"jal","coverageStates":[],"socialEnabled":true,"socialThemes":[{"title":"T","links":{"instagram":"javascript:alert(1)","facebook":"","x":"","tiktok":"","youtube":""}}]}')
grep -q 'links.instagram' <<<"$resp" || fail "acepto un link javascript:  $resp"

echo "6. estado de cobertura igual al de origen -> 422"
resp=$(api -X PUT "$BASE/api/media/$ID" -d '{"name":"Prueba","stateId":"jal","coverageStates":["jal"],"socialThemes":[]}')
grep -q 'coverageStates' <<<"$resp" || fail "acepto el origen como cobertura"

echo "7. guardado valido persiste"
api -X PUT "$BASE/api/media/$ID" \
  -d '{"name":"Medio Editado [[Jalisco]]","stateId":"jal","active":true,"notes":"Nota uno\nNota dos","coverageText":"Cobertura X","coverageStates":["col"],"socialEnabled":false,"socialThemes":[]}' >/dev/null
api "$BASE/api/media/$ID" | python3 -c '
import json,sys
m = json.load(sys.stdin)["medium"]
assert m["name"] == "Medio Editado [[Jalisco]]", m["name"]
assert m["coverageStates"] == ["col"], m["coverageStates"]
assert m["notes"].count("\n") == 1, m["notes"]
' || fail "no persistio"

echo "8. crear genera el id a partir del nombre"
NEW=$(api -X POST "$BASE/api/media" \
  -d '{"name":"Radio Nueva de Prueba","stateId":"col","active":true,"notes":"","coverageText":"","coverageStates":[],"socialEnabled":false,"socialThemes":[]}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
[ "$NEW" = "radio-nueva-de-prueba" ] || fail "id inesperado: $NEW"

echo "9. eliminar quita el medio"
api -X DELETE "$BASE/api/media/$NEW" >/dev/null
[ "$(code "$BASE/api/media/$NEW")" = "404" ] || fail "sigue existiendo"

echo "10. apariencia: fuera de rango -> 422, valida -> 200"
current=$(api "$BASE/api/appearance" | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["appearance"]))')
bad=$(python3 -c "import json,sys; a=json.loads(sys.argv[1]); a['glowOpacity']=101; print(json.dumps(a))" "$current")
[ "$(code -X PUT "$BASE/api/appearance" -d "$bad")" = "422" ] || fail "acepto opacidad 101"
[ "$(code -X PUT "$BASE/api/appearance" -d "$current")" = "200" ] || fail "rechazo valores validos"

echo
echo "Catalogo correcto."
