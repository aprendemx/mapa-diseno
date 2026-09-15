#!/usr/bin/env bash
# End-to-end check of the sign-in flow against a running dev server.
#
#   npm run dev            # in one terminal
#   ./scripts/smoke-auth.sh <correo> <contrasena>
#
# Exercises what unit tests cannot: that the cookie is actually set with the
# right attributes, that it authenticates the next request, and that signing
# out kills the session server-side and not just in the browser.
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
EMAIL="${1:?uso: smoke-auth.sh <correo> <contrasena>}"
PASSWORD="${2:?uso: smoke-auth.sh <correo> <contrasena>}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

fail() { echo "  FALLO: $1" >&2; exit 1; }
# El servidor formatea el JSON; comparar sobre el texto crudo es fragil.
squash() { tr -d " \n\t"; }

echo "1. sin sesion, /api/auth/me devuelve null"
curl -sf "$BASE/api/auth/me" | squash | grep -q '"user":null' || fail "deberia no haber usuario"

echo "2. contrasena incorrecta -> 401"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"definitivamente-incorrecta\"}")
[ "$code" = "401" ] || fail "esperaba 401, llego $code"

echo "3. correo inexistente -> 401, mismo mensaje"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"nadie@aprende.gob.mx","password":"x"}')
[ "$code" = "401" ] || fail "esperaba 401, llego $code"

echo "4. credenciales correctas -> 200 y cookie de sesion"
headers=$(curl -s -D - -o /dev/null -c "$JAR" -X POST "$BASE/api/auth/login" \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
grep -qi 'set-cookie: *mapa_session=' <<<"$headers" || fail "no llego la cookie"
grep -qi 'httponly' <<<"$headers" || fail "la cookie no es HttpOnly"
grep -qi 'samesite=lax' <<<"$headers" || fail "la cookie no es SameSite=Lax"

echo "5. la cookie autentica la siguiente peticion"
curl -sf -b "$JAR" "$BASE/api/auth/me" | squash | grep -q "\"email\":\"$EMAIL\"" \
  || fail "la sesion no autentico"

echo "6. la respuesta no filtra material de contrasena"
curl -sf -b "$JAR" "$BASE/api/auth/me" | grep -qi 'password' \
  && fail "la respuesta menciona password" || true

echo "7. cerrar sesion invalida del lado del servidor"
curl -sf -b "$JAR" -X POST "$BASE/api/auth/logout" >/dev/null
# Reusa la cookie vieja a proposito: borrarla del navegador no alcanza.
curl -sf -b "$JAR" "$BASE/api/auth/me" | squash | grep -q '"user":null' \
  || fail "la sesion sigue viva despues de cerrar sesion"

echo
echo "Flujo de autenticacion correcto."
