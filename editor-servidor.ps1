param([int]$Puerto = 8765)
$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot
$datosRuta = Join-Path $raiz 'datos\proyecto.json'
$editorRuta = Join-Path $raiz 'editor.html'
$extensionesPermitidas = @('.jpg','.jpeg','.png','.webp','.gif','.svg','.avif','.mp4','.webm','.mov','.m4v','.mpeg','.mpg','.mp3','.wav','.ogg','.m4a','.aac','.flac')

function Leer-Proyecto {
    if (-not (Test-Path -LiteralPath $datosRuta -PathType Leaf)) { throw 'Falta datos/proyecto.json' }
    return ([IO.File]::ReadAllText($datosRuta, [Text.Encoding]::UTF8) | ConvertFrom-Json)
}
function Ruta-Segura([string]$relativa, [string]$prefijo) {
    $normal = $relativa.Replace('/', [IO.Path]::DirectorySeparatorChar).TrimStart('\')
    $completa = [IO.Path]::GetFullPath((Join-Path $raiz $normal))
    $permitida = [IO.Path]::GetFullPath((Join-Path $raiz $prefijo)) + [IO.Path]::DirectorySeparatorChar
    if (-not $completa.StartsWith($permitida, [StringComparison]::OrdinalIgnoreCase)) { throw 'Ruta no permitida.' }
    return $completa
}
function Responder-Json($contexto, $objeto, [int]$estado = 200) {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($objeto | ConvertTo-Json -Depth 30 -Compress))
    $contexto.Response.StatusCode = $estado; $contexto.Response.ContentType = 'application/json; charset=utf-8'; $contexto.Response.ContentLength64 = $bytes.Length
    $contexto.Response.OutputStream.Write($bytes, 0, $bytes.Length); $contexto.Response.Close()
}
function Servir-Archivo($contexto, [string]$ruta) {
    if (-not (Test-Path -LiteralPath $ruta -PathType Leaf)) { $contexto.Response.StatusCode = 404; $contexto.Response.Close(); return }
    $tipos = @{'.html'='text/html; charset=utf-8';'.svg'='image/svg+xml';'.png'='image/png';'.jpg'='image/jpeg';'.jpeg'='image/jpeg';'.webp'='image/webp';'.gif'='image/gif';'.avif'='image/avif';'.mp4'='video/mp4';'.webm'='video/webm';'.mov'='video/quicktime';'.m4v'='video/mp4';'.mpeg'='video/mpeg';'.mpg'='video/mpeg';'.mp3'='audio/mpeg';'.wav'='audio/wav';'.ogg'='audio/ogg';'.m4a'='audio/mp4';'.aac'='audio/aac';'.flac'='audio/flac'}
    $ext = [IO.Path]::GetExtension($ruta).ToLowerInvariant()
    $archivo = Get-Item -LiteralPath $ruta
    $total = [long]$archivo.Length
    $inicio = [long]0
    $fin = [long]($total - 1)
    $esParcial = $false
    $rango = [string]$contexto.Request.Headers['Range']

    if (-not [string]::IsNullOrWhiteSpace($rango) -and $rango -match '^bytes=(\d*)-(\d*)$') {
        $primero = [string]$matches[1]
        $ultimo = [string]$matches[2]
        if ($primero -eq '' -and $ultimo -ne '') {
            $cantidad = [Math]::Min([long]$ultimo, $total)
            $inicio = $total - $cantidad
        } elseif ($primero -ne '') {
            $inicio = [long]$primero
            if ($ultimo -ne '') { $fin = [Math]::Min([long]$ultimo, $total - 1) }
        }
        if ($inicio -lt 0 -or $inicio -ge $total -or $fin -lt $inicio) {
            $contexto.Response.StatusCode = 416
            $contexto.Response.Headers['Content-Range'] = "bytes */$total"
            $contexto.Response.Close()
            return
        }
        $esParcial = $true
    }

    $longitud = [long]($fin - $inicio + 1)
    $contexto.Response.ContentType = $(if ($tipos[$ext]) { $tipos[$ext] } else { 'application/octet-stream' })
    $contexto.Response.Headers['Accept-Ranges'] = 'bytes'
    $contexto.Response.ContentLength64 = $longitud
    if ($esParcial) {
        $contexto.Response.StatusCode = 206
        $contexto.Response.Headers['Content-Range'] = "bytes $inicio-$fin/$total"
    }

    $flujo = [IO.File]::Open($ruta, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    try {
        [void]$flujo.Seek($inicio, [IO.SeekOrigin]::Begin)
        $buffer = New-Object byte[] 65536
        $restante = $longitud
        while ($restante -gt 0) {
            $aLeer = [int][Math]::Min([long]$buffer.Length, $restante)
            $leidos = $flujo.Read($buffer, 0, $aLeer)
            if ($leidos -le 0) { break }
            $contexto.Response.OutputStream.Write($buffer, 0, $leidos)
            $restante -= $leidos
        }
    } finally {
        $flujo.Dispose()
        $contexto.Response.OutputStream.Close()
        $contexto.Response.Close()
    }
}

if (-not (Test-Path -LiteralPath $editorRuta)) { throw 'Falta editor.html' }
$listener = New-Object Net.HttpListener
while ($true) { try { $listener.Prefixes.Clear(); $listener.Prefixes.Add("http://localhost:$Puerto/"); $listener.Start(); break } catch { $Puerto++; if ($Puerto -gt 8795) { throw 'No se encontró un puerto disponible.' } } }
$url = "http://localhost:$Puerto/"
Write-Host ''; Write-Host 'EDITOR DEL MAPA DE MEXICO' -ForegroundColor Green; Write-Host "Abierto en $url" -ForegroundColor Cyan
Write-Host 'No cierres esta ventana mientras estés editando.' -ForegroundColor Yellow; Write-Host 'Para terminar, cierra esta ventana.' -ForegroundColor DarkGray
Start-Process $url

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        try {
            $ruta = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
            if ($ctx.Request.HttpMethod -eq 'GET' -and ($ruta -eq '/' -or $ruta -eq '/editor.html')) { Servir-Archivo $ctx $editorRuta }
            elseif ($ctx.Request.HttpMethod -eq 'GET' -and $ruta -eq '/api/project') { Responder-Json $ctx (Leer-Proyecto) }
            elseif ($ctx.Request.HttpMethod -eq 'POST' -and $ruta -eq '/api/save') {
                $reader = New-Object IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8)
                $entrada = ($reader.ReadToEnd() | ConvertFrom-Json)
                $actual = Leer-Proyecto

                $ids = @{}
                foreach ($medio in @($entrada.project.media)) {
                    if ([string]::IsNullOrWhiteSpace([string]$medio.id) -or [string]::IsNullOrWhiteSpace([string]$medio.name)) { throw 'Todos los medios necesitan nombre.' }
                    if ($ids.ContainsKey([string]$medio.id)) { throw "ID interno repetido: $($medio.id)" }
                    $ids[[string]$medio.id] = $true
                    if ($medio.stateId -and -not (@($actual.states.id) -contains [string]$medio.stateId)) { throw "Estado inválido en $($medio.name)." }
                    foreach ($coverageState in @($medio.coverageStates)) {
                        if ($coverageState -and -not (@($actual.states.id) -contains [string]$coverageState)) { throw "Estado de cobertura inválido en $($medio.name): $coverageState." }
                    }
                }

                # Índice de archivos registrados antes de guardar. El ID del archivo se usa para
                # reconocerlo aunque cambien el nombre visible o la carpeta del medio.
                $archivosActuales = @{}
                foreach ($medioActual in @($actual.media)) {
                    foreach ($archivoActual in @($medioActual.files)) {
                        $fid = [string]$archivoActual.id
                        $rutaActual = [string]$archivoActual.file
                        if (-not [string]::IsNullOrWhiteSpace($fid) -and -not [string]::IsNullOrWhiteSpace($rutaActual)) {
                            $archivosActuales[$fid] = $rutaActual
                        }
                    }
                }

                # Rutas que el proyecto nuevo sí utiliza. Cualquier otro archivo dentro de
                # contenidos se podrá limpiar, excepto contenidos/logos-redes.
                $referenciados = @{}
                foreach ($medioNuevo in @($entrada.project.media)) {
                    foreach ($archivoNuevo in @($medioNuevo.files)) {
                        $rel = ([string]$archivoNuevo.file).Replace('\','/')
                        if (-not [string]::IsNullOrWhiteSpace($rel)) {
                            [void](Ruta-Segura $rel 'contenidos')
                            $referenciados[$rel.ToLowerInvariant()] = $true
                        }
                    }
                }

                $reorganizados = 0
                $eliminados = 0
                $advertencias = New-Object 'System.Collections.Generic.List[string]'

                # Reubicar archivos existentes a la carpeta derivada del nombre actual del medio.
                # Se copia primero y el original se retira después para evitar pérdida de datos.
                foreach ($medioNuevo in @($entrada.project.media)) {
                    foreach ($archivoNuevo in @($medioNuevo.files)) {
                        $fid = [string]$archivoNuevo.id
                        $nuevoRel = ([string]$archivoNuevo.file).Replace('\','/')
                        if ([string]::IsNullOrWhiteSpace($fid) -or [string]::IsNullOrWhiteSpace($nuevoRel)) { continue }
                        if (-not $archivosActuales.ContainsKey($fid)) { continue }

                        $viejoRel = ([string]$archivosActuales[$fid]).Replace('\','/')
                        if ($viejoRel -ieq $nuevoRel) { continue }

                        $origen = Ruta-Segura $viejoRel 'contenidos'
                        $destino = Ruta-Segura $nuevoRel 'contenidos'
                        New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($destino)) | Out-Null

                        if (Test-Path -LiteralPath $origen -PathType Leaf) {
                            try {
                                [IO.File]::Copy($origen, $destino, $true)
                                $reorganizados++
                            } catch {
                                throw "No se pudo reorganizar $viejoRel hacia $nuevoRel. $($_.Exception.Message)"
                            }
                        } elseif (-not (Test-Path -LiteralPath $destino -PathType Leaf)) {
                            throw "No se encontró el archivo registrado: $viejoRel"
                        }
                    }
                }

                # Guardar archivos nuevos directamente en la carpeta normalizada del medio.
                foreach ($archivo in @($entrada.uploads)) {
                    $relSubida = ([string]$archivo.path).Replace('\','/')
                    if ([string]::IsNullOrWhiteSpace($relSubida) -or -not $referenciados.ContainsKey($relSubida.ToLowerInvariant())) {
                        throw "La subida no corresponde a un archivo registrado: $relSubida"
                    }
                    $ext = [IO.Path]::GetExtension($relSubida).ToLowerInvariant()
                    if (-not ($extensionesPermitidas -contains $ext)) { throw "Formato no permitido: $ext" }
                    $destino = Ruta-Segura $relSubida 'contenidos'
                    New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($destino)) | Out-Null
                    [IO.File]::WriteAllBytes($destino, [Convert]::FromBase64String([string]$archivo.base64))
                }

                $apariencia = $(if ($null -ne $entrada.project.appearance) { $entrada.project.appearance } elseif ($null -ne $actual.appearance) { $actual.appearance } else { [ordered]@{} })
                $versionProyecto = 4
                if ($null -ne $entrada.project.version) { $versionProyecto = [int]$entrada.project.version }
                $proyecto = [ordered]@{ version = $versionProyecto; appearance = $apariencia; states = @($actual.states); media = @($entrada.project.media) }
                [IO.File]::WriteAllText($datosRuta, (($proyecto | ConvertTo-Json -Depth 40) + "`r`n"), (New-Object Text.UTF8Encoding($false)))

                # Limpieza automática: cualquier archivo físico que ya no esté registrado se borra.
                # Los PNG/SVG locales de las redes sociales se conservan siempre en logos-redes.
                $contenidosRaiz = [IO.Path]::GetFullPath((Join-Path $raiz 'contenidos'))
                $prefijoContenidos = $contenidosRaiz.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
                $logosRaiz = [IO.Path]::GetFullPath((Join-Path $contenidosRaiz 'logos-redes'))
                $prefijoLogos = $logosRaiz.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

                if (Test-Path -LiteralPath $contenidosRaiz -PathType Container) {
                    foreach ($fisico in @(Get-ChildItem -LiteralPath $contenidosRaiz -File -Recurse -Force)) {
                        $completa = [IO.Path]::GetFullPath($fisico.FullName)
                        if ($completa.StartsWith($prefijoLogos, [StringComparison]::OrdinalIgnoreCase)) { continue }
                        $sub = $completa.Substring($prefijoContenidos.Length).Replace('\','/')
                        $rel = ('contenidos/' + $sub).ToLowerInvariant()
                        if (-not $referenciados.ContainsKey($rel)) {
                            try {
                                Remove-Item -LiteralPath $completa -Force -ErrorAction Stop
                                $eliminados++
                            } catch {
                                $advertencias.Add("No se pudo eliminar todavía: contenidos/$sub")
                            }
                        }
                    }

                    # Quitar carpetas antiguas que hayan quedado vacías tras la reorganización.
                    $directorios = @(Get-ChildItem -LiteralPath $contenidosRaiz -Directory -Recurse -Force | Sort-Object { $_.FullName.Length } -Descending)
                    foreach ($dir in $directorios) {
                        $dirCompleta = [IO.Path]::GetFullPath($dir.FullName)
                        if ($dirCompleta -ieq $logosRaiz -or $dirCompleta.StartsWith($prefijoLogos, [StringComparison]::OrdinalIgnoreCase)) { continue }
                        if (-not (Get-ChildItem -LiteralPath $dirCompleta -Force | Select-Object -First 1)) {
                            try { Remove-Item -LiteralPath $dirCompleta -Force -ErrorAction Stop } catch { }
                        }
                    }
                }

                # Regenerar solo después de reorganizar y limpiar, para que entrega/contenidos
                # reciba exactamente la misma estructura limpia del proyecto.
                $scriptGenerador = Join-Path $raiz 'generar-mapa.ps1'
                $salidaGenerador = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptGenerador -SinPausa 2>&1 | Out-String).Trim()
                if ($LASTEXITCODE -ne 0) {
                    $detalle = $(if ([string]::IsNullOrWhiteSpace($salidaGenerador)) { 'El generador terminó sin proporcionar detalles.' } else { $salidaGenerador })
                    throw "Los datos se guardaron, pero no se pudo regenerar el mapa. Detalle: $detalle"
                }

                $mensaje = 'Proyecto guardado y mapa actualizado.'
                if ($reorganizados -gt 0) { $mensaje += " $reorganizados archivo(s) reorganizado(s) según el nombre actual de sus medios." }
                if ($eliminados -gt 0) { $mensaje += " $eliminados archivo(s) sin uso eliminado(s) automáticamente." }
                if ($advertencias.Count -gt 0) { $mensaje += " $($advertencias.Count) archivo(s) no pudieron retirarse todavía porque estaban en uso." }
                Responder-Json $ctx @{ok=$true; message=$mensaje; moved=$reorganizados; deleted=$eliminados; cleanupWarnings=$advertencias.Count}
            }
            elseif ($ctx.Request.HttpMethod -eq 'GET' -and $ruta.StartsWith('/files/')) {
                $relativa = $ruta.Substring(7)
                if ($relativa.StartsWith('contenidos/')) { Servir-Archivo $ctx (Ruta-Segura $relativa 'contenidos') }
                elseif ($relativa.StartsWith('entrega/')) { Servir-Archivo $ctx (Ruta-Segura $relativa 'entrega') }
                else { $ctx.Response.StatusCode = 403; $ctx.Response.Close() }
            }
            else { $ctx.Response.StatusCode = 404; $ctx.Response.Close() }
        } catch {
            $mensajeError = $_.Exception.Message
            try { Responder-Json $ctx @{ok=$false; message=$mensajeError} 500 }
            catch { try { $ctx.Response.Abort() } catch { } }
        }
    }
} finally { $listener.Stop(); $listener.Close() }
