#!/usr/bin/env bash
# Publica una entrega generada por la herramienta PowerShell.
#
#   ./deploy/publicar-entrega.sh ~/Downloads/mapa-datos
#
# Autocontenido: no necesita el resto del repositorio, solo bash, rsync,
# python3 y acceso ssh al servidor. Copiar este archivo suelto alcanza.
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
tiene() { command -v "$1" >/dev/null 2>&1; }

# macOS no trae todo esto de fabrica. Revisar antes de verificar una entrega
# completa y fallar en el ultimo paso.
for prog in rsync python3 ssh; do
  tiene "$prog" || fail "falta $prog. En macOS: brew install rsync python3"
done

# rsync de macOS es 2.6.9 (de 2006) hasta Sonoma, y openrsync desde Sequoia.
# --info= existe desde 3.1.0 y --itemize-changes desde 2.6.4, asi que se
# prueban en lugar de asumirse: un flag no soportado falla recien al subir,
# despues de haber verificado todo.
soporta() { rsync --help 2>&1 | grep -q -- "$1"; }
PROGRESO=()
soporta '--info=' && PROGRESO=(--info=progress2) || { soporta '--progress' && PROGRESO=(--progress); }
DETALLE=()
soporta '--itemize-changes' && DETALLE=(--itemize-changes)

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

PLAN=$("${RSYNC[@]}" --dry-run -v "${DETALLE[@]+"${DETALLE[@]}"}" 2>&1)

# Las versiones viejas escriben "deleting <ruta>"; las nuevas "*deleting ".
BORRADOS=$(grep -E '^\*?deleting ' <<<"$PLAN" || true)
BORRA=$(grep -cE '^\*?deleting ' <<<"$PLAN" || true)

if [ ${#DETALLE[@]} -gt 0 ]; then
  CAMBIOS=$(grep -c '^>f' <<<"$PLAN" || true)
  NUEVOS=$(grep -c '^>f+++++++++' <<<"$PLAN" || true)
  echo "   archivos nuevos o modificados: $CAMBIOS (de ellos nuevos: $NUEVOS)"
else
  echo "   archivos a transferir: $(grep -cvE '^(deleting |sending |sent |total |$|\./)' <<<"$PLAN" || true)"
fi

echo "   archivos que se BORRAN:        $BORRA"
if [ "$BORRA" -gt 0 ]; then
  echo
  echo "   se borran, por ejemplo:"
  head -5 <<<"$BORRADOS" | sed 's/^/     /'
fi

echo
echo "Destino: $DESTINO"
read -r -p "Escribi PUBLICAR para continuar: " respuesta
[ "$respuesta" = "PUBLICAR" ] || { echo "Cancelado. No se subio nada."; exit 1; }

echo
"${RSYNC[@]}" "${PROGRESO[@]+"${PROGRESO[@]}"}"

echo
echo "Subido. Verificar:"
echo "  curl -sI -A 'Mozilla/5.0' https://\$DOMINIO/ | head -1"
