# Referencias golden

Cada directorio es una entrega real del pipeline PowerShell, con su entrada y su
salida verificada en producción. No se escriben a mano.

| | Entrada | Salida |
| --- | --- | --- |
| `project.json` | el `datos/proyecto.json` de esa entrega | — |
| `expected-map-data.json` | — | el `PROJECT_DATA` que quedó en la página |
| `published.html` | — | la página completa que se sirvió |

`published.html` está acá y no se lee de `entrega/` porque esa carpeta está en
`.gitignore` por peso: una prueba que depende de un archivo no versionado solo
corre en la máquina de quien la escribió.

## Por qué hay más de una

`2026-08` es la entrega contra la que se construyó el port. `2026-10` llegó
después y el generador la reprodujo exacta sin haberla visto nunca — evidencia
independiente, no circular.

Y cubre tres ramas que agosto no recorría: 11 medios inactivos, 11 con notas
vacías y 11 sin archivos. Hasta entonces esas ramas solo las verificaban pruebas
escritas a mano.

Cuando llegue otra entrega, agregarla acá es gratis y vuelve a probar el
generador contra datos que no vio:

```bash
npm run extract-reference -- --entrega <carpeta> --nombre 2026-11
```
