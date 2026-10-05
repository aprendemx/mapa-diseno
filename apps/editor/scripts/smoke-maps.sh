#!/usr/bin/env bash
# Comprueba el manejo de mapas y su aislamiento, contra un servidor levantado.
#
#   ./scripts/smoke-maps.sh <correo> <contrasena>
#
# Las pruebas de integracion ya demuestran el aislamiento en el adaptador. Esto
# comprueba la capa de arriba: que el slug de la ruta sea lo que decide, y que
# un identificador de otro mapa en la URL no alcance a sus datos.
set -euo pipefail

BASE="${BASE:-http://localhost:3000/admin}"
EMAIL="${1:?uso: smoke-maps.sh <correo> <contrasena>}"
PASSWORD="${2:?uso: smoke-maps.sh <correo> <contrasena>}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

fail() { echo "  FALLO: $1" >&2; exit 1; }
api()  { curl -s -b "$JAR" -H 'content-type: application/json' "$@"; }
code() { curl -s -o /dev/null -w '%{http_code}' -b "$JAR" -H 'content-type: application/json' "$@"; }

echo "0. la lista de mapas exige sesion"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/maps")" = "401" ] || fail "no exigio sesion"

curl -s -o /dev/null -c "$JAR" -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"

echo "1. hay un mapa y sirve la raiz"
api "$BASE/api/maps" | python3 -c '
import json, sys
maps = json.load(sys.stdin)["maps"]
assert len(maps) >= 1, maps
raiz = [m for m in maps if m["is_default"]]
assert len(raiz) == 1, raiz
print(f"   /{raiz[0]['"'"'slug'"'"']} en la raiz, {len(maps)} mapa(s)")' || fail "estado inesperado"

echo "2. un slug reservado se rechaza"
[ "$(code -X POST "$BASE/api/maps" -d '{"name":"X","slug":"admin"}')" = "422" ] \
  || fail "acepto el slug admin"

echo "3. un slug mal formado se rechaza"
[ "$(code -X POST "$BASE/api/maps" -d '{"name":"X","slug":"Con Espacios"}')" = "422" ] \
  || fail "acepto un slug con espacios"

echo "4. un mapa sin nombre se rechaza"
[ "$(code -X POST "$BASE/api/maps" -d '{"name":"  ","slug":"prueba"}')" = "422" ] \
  || fail "acepto un mapa sin nombre"

echo "5. crear un segundo mapa"
SLUG="prueba-humo"
api -X DELETE "$BASE/api/maps/$SLUG" >/dev/null 2>&1 || true
[ "$(code -X POST "$BASE/api/maps" -d "{\"name\":\"Prueba de humo\",\"slug\":\"$SLUG\"}")" = "201" ] \
  || fail "no pudo crear el mapa"

echo "6. el slug repetido se rechaza"
[ "$(code -X POST "$BASE/api/maps" -d "{\"name\":\"Otra\",\"slug\":\"$SLUG\"}")" = "409" ] \
  || fail "acepto un slug repetido"

echo "7. el mapa nuevo nace vacio, y el viejo sigue intacto"
api "$BASE/api/maps/$SLUG/media" | grep -q '"media": \[\]' || fail "el mapa nuevo no nacio vacio"
MEDIOS=$(api "$BASE/api/maps/redmexico/media" | grep -c '"id"')
[ "$MEDIOS" -ge 32 ] || fail "el catalogo de redmexico cambio: $MEDIOS"

echo "8. un medio del otro mapa no se alcanza por la URL"
ID=$(api "$BASE/api/maps/redmexico/media" | python3 -c 'import json,sys; print(json.load(sys.stdin)["media"][0]["id"])')
[ "$(code "$BASE/api/maps/$SLUG/media/$ID")" = "404" ] || fail "alcanzo un medio del mapa ajeno"
[ "$(code -X DELETE "$BASE/api/maps/$SLUG/media/$ID")" = "404" ] || fail "pudo borrar un medio ajeno"
api "$BASE/api/maps/redmexico/media/$ID" | grep -q "$ID" || fail "el medio ajeno desaparecio"

echo "9. un mapa inexistente en la ruta da 404"
[ "$(code "$BASE/api/maps/no-existe/media")" = "404" ] || fail "no dio 404"

echo "10. no se puede borrar el mapa de la raiz"
[ "$(code -X DELETE "$BASE/api/maps/redmexico")" = "409" ] || fail "permitio borrar el de la raiz"

echo "11. pasar el nuevo a la raiz mueve los enlaces, no solo la base"
[ "$(code -X POST "$BASE/api/maps/$SLUG/default")" = "200" ] || fail "no pudo cambiar la raiz"
api "$BASE/api/maps" | python3 -c '
import json, sys
maps = json.load(sys.stdin)["maps"]
raiz = [m for m in maps if m["is_default"]]
assert len(raiz) == 1 and raiz[0]["slug"] == "prueba-humo", raiz' || fail "la raiz no cambio bien"
# Sin esto la base diria una cosa y el sitio entregaria otra, en silencio.
SITIO="${SITIO:-../../sitio}"
[ "$(readlink "$SITIO/index.html")" = "$SLUG/index.html" ] \
  || fail "el enlace de la raiz no siguio al mapa: $(readlink "$SITIO/index.html")"
[ "$(readlink "$SITIO/contenidos")" = "$SLUG/contenidos" ] \
  || fail "el enlace de contenidos no siguio al mapa"

[ "$(code -X POST "$BASE/api/maps/redmexico/default")" = "200" ] || fail "no pudo volver"
[ "$(readlink "$SITIO/index.html")" = "redmexico/index.html" ] || fail "no volvio el enlace"

echo "12. borrar el mapa de prueba deja el otro intacto"
[ "$(code -X DELETE "$BASE/api/maps/$SLUG")" = "200" ] || fail "no pudo borrar"
AHORA=$(api "$BASE/api/maps/redmexico/media" | grep -c '"id"')
[ "$AHORA" = "$MEDIOS" ] || fail "el catalogo de redmexico cambio: $MEDIOS -> $AHORA"

echo
echo "Manejo de mapas correcto."
