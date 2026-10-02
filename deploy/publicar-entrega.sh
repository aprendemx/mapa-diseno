#!/usr/bin/env bash
# Publica una entrega generada por la herramienta PowerShell.
#
#   ./deploy/publicar-entrega.sh /mnt/c/Users/LFZARAZUA/Downloads/mapa-datos
#
# Provisorio: deja de hacer falta cuando el editor web este en produccion, que
# hace esto mismo con validacion previa, swap atomico e historial.
#
# Verifica antes de subir, porque este rsync lleva --delete sobre ~1 GB: lo que
# no venga en la entrega se borra del servidor. Un dedazo en la ruta de destino
# con --delete puesto no tiene vuelta atras.
set -euo pipefail

ORIGEN="${1:?uso: publicar-entrega.sh <carpeta-descomprimida-del-zip>}"
DESTINO="${DESTINO:-bravee@emi-minio:/opt/mapa-mexico/sitio/}"

ENTREGA="$ORIGEN/entrega"
MAPA="$ENTREGA/ABRIR MAPA.html"

fail() { echo "  FALLO: $1" >&2; exit 1; }

[ -d "$ENTREGA" ]  || fail "no hay carpeta entrega/ en $ORIGEN"
[ -f "$MAPA" ]     || fail "no hay 'ABRIR MAPA.html' en $ENTREGA"
[ -f "$ORIGEN/datos/proyecto.json" ] || fail "no hay datos/proyecto.json"

echo "1. el mapa generado corresponde a los datos"
python3 - "$ORIGEN" <<'CHECK'
import json, os, re, sys
raiz = sys.argv[1]

html = open(os.path.join(raiz, 'entrega', 'ABRIR MAPA.html'), encoding='utf-8').read()
bloque = re.search(r'/\*__DATOS_GENERADOS_INICIO__\*/(.*?)/\*__DATOS_GENERADOS_FIN__\*/', html, re.S)
if not bloque:
    raise SystemExit('el HTML no tiene el bloque de datos generados')
pub = json.loads(re.search(r'const PROJECT_DATA=(\{.*\});', bloque.group(1), re.S).group(1))

src = json.load(open(os.path.join(raiz, 'datos', 'proyecto.json'), encoding='utf-8'))
notas = sum(len([l for l in m.get('notes', '').splitlines() if l.strip()]) for m in src['media'])

# Si no coinciden, el HTML es de una generacion anterior: hay que correr
# ACTUALIZAR MAPA.bat antes de subir, o se publica un mapa viejo.
if len(pub['media']) != len(src['media']) or len(pub['campaigns']) != notas:
    raise SystemExit(
        f"el HTML esta desincronizado: datos {len(src['media'])} medios/{notas} notas, "
        f"HTML {len(pub['media'])} medios/{len(pub['campaigns'])} notas. "
        'Correr ACTUALIZAR MAPA.bat antes de subir.')

faltan = [c['file'] for c in pub['contents']
          if 'file' in c and not os.path.isfile(os.path.join(raiz, 'entrega', c['file']))]
if faltan:
    raise SystemExit(f'{len(faltan)} testigo(s) referenciados no estan en entrega/: ' + faltan[0])

activos = sum(1 for s in pub['states'] if s['active'] == '1')
print(f"   {len(pub['media'])} medios, {len(pub['campaigns'])} notas, "
      f"{len(pub['contents'])} testigos, {activos}/32 estados activos")
CHECK

echo "2. preparando index.html"
cp "$MAPA" "$ENTREGA/index.html"

echo "3. que cambiaria en el servidor"
RSYNC=(rsync -a --delete --partial
       --exclude 'entrega.zip' --exclude 'ABRIR MAPA.html'
       "$ENTREGA/" "$DESTINO")

PLAN=$("${RSYNC[@]}" --dry-run --itemize-changes)
NUEVOS=$(grep -c '^>f+++++++++' <<<"$PLAN" || true)
CAMBIOS=$(grep -c '^>f' <<<"$PLAN" || true)
BORRA=$(grep -c '^\*deleting' <<<"$PLAN" || true)

echo "   archivos nuevos o modificados: $CAMBIOS (de ellos nuevos: $NUEVOS)"
echo "   archivos que se BORRAN:        $BORRA"
if [ "$BORRA" -gt 0 ]; then
  echo
  echo "   se borran, por ejemplo:"
  grep '^\*deleting' <<<"$PLAN" | head -5 | sed 's/^/     /'
fi

echo
echo "Destino: $DESTINO"
read -r -p "Escribi PUBLICAR para continuar: " respuesta
[ "$respuesta" = "PUBLICAR" ] || { echo "Cancelado. No se subio nada."; exit 1; }

echo
"${RSYNC[@]}" --info=progress2

echo
echo "Subido. Verificar:"
echo "  curl -sI -A 'Mozilla/5.0' https://\$DOMINIO/ | head -1"
