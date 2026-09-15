param([switch]$SinPausa)
$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot; $datosRuta = Join-Path $raiz 'datos\proyecto.json'; $plantilla = Join-Path $raiz 'mapa-base.html'
$contenidosDir = Join-Path $raiz 'contenidos'; $entregaDir = Join-Path $raiz 'entrega'; $salida = Join-Path $entregaDir 'ABRIR MAPA.html'
function Id-Nota([string]$medio,[int]$n) { return "$medio-nota-$n" }
try {
    if (-not (Test-Path -LiteralPath $datosRuta -PathType Leaf)) { throw 'Falta datos/proyecto.json' }
    $data = [IO.File]::ReadAllText($datosRuta,[Text.Encoding]::UTF8) | ConvertFrom-Json
    $appearance=[ordered]@{
        backgroundColor='#2f302e'
        titleColor='#e9e9dc'
        stateWithMediaColor='#e9e9dc'
        stateDisabledColor='#e9e9dc'
        stateHoverColor='#43a56f'
        stateSelectedColor='#08783f'
        coverageOriginColor='#08783f'
        coverageAreaColor='#43a56f'
        glowColor='#f4cf45'
        glowIntensity=18
        glowOpacity=85
        glowCoreSize=2
        glowSpread=10
        glowOutline=1.6
        accentColor='#08783f'
    }
    if($null -ne $data.appearance){
        if($data.appearance.backgroundColor){$appearance['backgroundColor']=[string]$data.appearance.backgroundColor}
        if($data.appearance.titleColor){$appearance['titleColor']=[string]$data.appearance.titleColor}
        if($data.appearance.stateWithMediaColor){$appearance['stateWithMediaColor']=[string]$data.appearance.stateWithMediaColor}
        if($data.appearance.stateDisabledColor){$appearance['stateDisabledColor']=[string]$data.appearance.stateDisabledColor}
        if($data.appearance.stateHoverColor){$appearance['stateHoverColor']=[string]$data.appearance.stateHoverColor}
        if($data.appearance.stateSelectedColor){$appearance['stateSelectedColor']=[string]$data.appearance.stateSelectedColor}
        if($data.appearance.coverageOriginColor){$appearance['coverageOriginColor']=[string]$data.appearance.coverageOriginColor}
        if($data.appearance.coverageAreaColor){$appearance['coverageAreaColor']=[string]$data.appearance.coverageAreaColor}
        if($data.appearance.glowColor){$appearance['glowColor']=[string]$data.appearance.glowColor}
        if($null -ne $data.appearance.glowIntensity){$appearance['glowIntensity']=[int]$data.appearance.glowIntensity}
        if($null -ne $data.appearance.glowOpacity){$appearance['glowOpacity']=[int]$data.appearance.glowOpacity}
        if($null -ne $data.appearance.glowCoreSize){$appearance['glowCoreSize']=[double]$data.appearance.glowCoreSize}
        if($null -ne $data.appearance.glowSpread){$appearance['glowSpread']=[double]$data.appearance.glowSpread}
        if($null -ne $data.appearance.glowOutline){$appearance['glowOutline']=[double]$data.appearance.glowOutline}
        if($data.appearance.accentColor){$appearance['accentColor']=[string]$data.appearance.accentColor}
    }
    if (@($data.states).Count -ne 32) { throw 'El catálogo debe conservar exactamente los 32 estados.' }
    $stateIds=@{}; foreach($state in @($data.states)){if($stateIds.ContainsKey([string]$state.id)){throw "Estado repetido: $($state.id)"};$stateIds[[string]$state.id]=$true}
    $mediaIds=@{}; $errores=New-Object 'System.Collections.Generic.List[string]'
    foreach($medium in @($data.media)){
        if([string]::IsNullOrWhiteSpace([string]$medium.id)-or[string]::IsNullOrWhiteSpace([string]$medium.name)){$errores.Add('Hay un medio sin nombre.')}
        elseif($mediaIds.ContainsKey([string]$medium.id)){$errores.Add("ID interno repetido: $($medium.id)")}else{$mediaIds[[string]$medium.id]=$true}
        if($medium.stateId-and-not $stateIds.ContainsKey([string]$medium.stateId)){$errores.Add("Estado inválido en $($medium.name)")}
        foreach($coverageState in @($medium.coverageStates)){if($coverageState-and-not $stateIds.ContainsKey([string]$coverageState)){$errores.Add("Estado de cobertura inválido en $($medium.name): $coverageState")}}
        foreach($file in @($medium.files)){if(-not[string]::IsNullOrWhiteSpace([string]$file.file)){ $rutaArchivo=Join-Path $raiz ([string]$file.file).Replace('/',[IO.Path]::DirectorySeparatorChar);if(-not(Test-Path -LiteralPath $rutaArchivo -PathType Leaf)){$errores.Add("No se encontró: $($file.file)")}}}
    }
    if($errores.Count){throw ($errores -join "`r`n")}
    # Solo se consideran activos los estados que tienen por lo menos un medio activo asociado.
    $estadosConRegistroActivo=@{}
    foreach($medium in @($data.media)){
        if($medium.stateId -and $medium.active){ $estadosConRegistroActivo[[string]$medium.stateId]=$true }
    }
    $states=@($data.states|ForEach-Object{
        $stateId=[string]$_.id
        [ordered]@{id=$stateId;name=[string]$_.name;active=$(if($estadosConRegistroActivo.ContainsKey($stateId)){'1'}else{'0'})}
    })
    $media=@();$coverage=@();$campaigns=@();$contents=@();$order=0
    foreach($medium in @($data.media)){
        $order++;$active=$(if($medium.active){'1'}else{'0'});$originId=[string]$medium.stateId;$manualCoverage=@($medium.coverageStates|ForEach-Object{[string]$_}|Where-Object{$_ -and $_ -ne $originId}|Select-Object -Unique)
        $socialEnabled=($medium.socialEnabled -eq $true)
        $media+=,[ordered]@{id=[string]$medium.id;name=[string]$medium.name;stateId=$originId;coverageStates=$manualCoverage;coverageText=[string]$medium.coverageText;socialEnabled=$socialEnabled;active=$active;order=$order}
        if($medium.stateId){$coverage+=,[ordered]@{stateId=[string]$medium.stateId;mediumId=[string]$medium.id;order=$order;active=$active}}
        $noteOrder=0;foreach($line in @(([string]$medium.notes)-split "`r?`n")){if(-not[string]::IsNullOrWhiteSpace($line)){$noteOrder++;$campaigns+=,[ordered]@{id=(Id-Nota ([string]$medium.id) $noteOrder);stateId=[string]$medium.stateId;mediumId=[string]$medium.id;name=$line.Trim();active=$active;order=$noteOrder}}}

        # Los testigos pueden mezclar archivos multimedia y temas de redes sociales.
        # witnessOrder conserva exactamente el orden elegido en el editor.
        $itemsById=@{};$fallbackOrder=New-Object 'System.Collections.Generic.List[string]'
        foreach($file in @($medium.files)){
            if(-not[string]::IsNullOrWhiteSpace([string]$file.file)){
                $fid=[string]$file.id;if([string]::IsNullOrWhiteSpace($fid)){$fid="$($medium.id)-archivo-$($fallbackOrder.Count+1)"}
                $itemsById[$fid]=[ordered]@{id=$fid;stateId=[string]$medium.stateId;mediumId=[string]$medium.id;type=[string]$file.type;file=([string]$file.file).Replace('\','/');description=[string]$file.description;active=$active}
                $fallbackOrder.Add($fid)
            }
        }
        if($socialEnabled){
            $socialN=0
            foreach($theme in @($medium.socialThemes)){
                $socialN++;$tid=[string]$theme.id;if([string]::IsNullOrWhiteSpace($tid)){$tid="$($medium.id)-social-$socialN"}
                $links=[ordered]@{instagram='';facebook='';x='';tiktok='';youtube=''}
                if($null -ne $theme.links){foreach($key in @('instagram','facebook','x','tiktok','youtube')){$prop=$theme.links.PSObject.Properties[$key];$value=$(if($null -ne $prop){[string]$prop.Value}else{''});if(-not[string]::IsNullOrWhiteSpace($value)){$links[$key]=$value.Trim()}}}
                $hasLink=$false;foreach($key in $links.Keys){if(-not[string]::IsNullOrWhiteSpace([string]$links[$key])){$hasLink=$true;break}}
                if($hasLink){$themeTitle=[string]$theme.title;if([string]::IsNullOrWhiteSpace($themeTitle)){$themeTitle="Tema $socialN"};$itemsById[$tid]=[ordered]@{id=$tid;stateId=[string]$medium.stateId;mediumId=[string]$medium.id;type='social';theme=$themeTitle.Trim();links=$links;active=$active};$fallbackOrder.Add($tid)}
            }
        }
        $orderedIds=New-Object 'System.Collections.Generic.List[string]';$seen=@{}
        foreach($wid in @($medium.witnessOrder)){ $id=[string]$wid;if($id -and $itemsById.ContainsKey($id) -and -not $seen.ContainsKey($id)){$orderedIds.Add($id);$seen[$id]=$true} }
        foreach($id in $fallbackOrder){if(-not $seen.ContainsKey($id)){$orderedIds.Add($id);$seen[$id]=$true}}
        $witnessOrder=0;foreach($id in $orderedIds){$witnessOrder++;$item=$itemsById[$id];$item['order']=$witnessOrder;$contents+=,$item}
    }
    $projectData=[ordered]@{appearance=$appearance;states=$states;media=$media;coverage=$coverage;campaigns=$campaigns;contents=$contents}
    $html=[IO.File]::ReadAllText($plantilla,[Text.Encoding]::UTF8);$json=$projectData|ConvertTo-Json -Depth 10 -Compress
    $bloque="/*__DATOS_GENERADOS_INICIO__*/`r`nconst PROJECT_DATA=$json;`r`n/*__DATOS_GENERADOS_FIN__*/";$patron='(?s)/\*__DATOS_GENERADOS_INICIO__\*/.*?/\*__DATOS_GENERADOS_FIN__\*/'
    $html=[Text.RegularExpressions.Regex]::Replace($html,$patron,[Text.RegularExpressions.MatchEvaluator]{param($m)$bloque})

    # Seguridad adicional: al cerrar/ocultar una pestaña o modal, cualquier audio/video
    # que haya quedado reproduciéndose se pausa y vuelve al inicio. También se detiene
    # si el usuario cambia de pestaña del navegador.
    $controlMultimedia=@'
<script id="control-cierre-multimedia">
(function () {
  function estaOculto(el) {
    if (!el || !el.isConnected) return true;
    for (let nodo = el; nodo && nodo.nodeType === 1; nodo = nodo.parentElement) {
      if (nodo.hidden || nodo.getAttribute('aria-hidden') === 'true') return true;
      const estilo = window.getComputedStyle(nodo);
      if (estilo.display === 'none' || estilo.visibility === 'hidden' || estilo.visibility === 'collapse') return true;
    }
    return false;
  }

  function detener(el) {
    if (!el || typeof el.pause !== 'function') return;
    try { el.pause(); } catch (_) {}
    try { el.currentTime = 0; } catch (_) {}
  }

  function detenerOcultos() {
    document.querySelectorAll('audio, video').forEach(function (el) {
      if (estaOculto(el)) detener(el);
    });
  }

  document.addEventListener('close', function (ev) {
    if (ev.target && ev.target.matches && ev.target.matches('dialog')) {
      ev.target.querySelectorAll('audio, video').forEach(detener);
    }
  }, true);

  document.addEventListener('cancel', function (ev) {
    if (ev.target && ev.target.matches && ev.target.matches('dialog')) {
      ev.target.querySelectorAll('audio, video').forEach(detener);
    }
  }, true);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) document.querySelectorAll('audio, video').forEach(detener);
  });

  const observar = function () {
    if (!document.body) return;
    const observer = new MutationObserver(function () {
      window.requestAnimationFrame(detenerOcultos);
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observar, {once:true});
  else observar();
})();
</script>
'@
    if($html -notmatch 'id=["'']control-cierre-multimedia["'']'){
        if($html -match '(?i)</body>'){
            $html=[Text.RegularExpressions.Regex]::Replace($html,'(?i)</body>',($controlMultimedia + "`r`n</body>"),1)
        } else {
            $html += "`r`n" + $controlMultimedia
        }
    }

    New-Item -ItemType Directory -Force -Path $entregaDir|Out-Null
    if(Test-Path -LiteralPath (Join-Path $entregaDir 'contenidos')){Remove-Item -LiteralPath (Join-Path $entregaDir 'contenidos') -Recurse -Force}
    if(Test-Path -LiteralPath $contenidosDir){Copy-Item -LiteralPath $contenidosDir -Destination $entregaDir -Recurse -Force}
    [IO.File]::WriteAllText($salida,$html,(New-Object Text.UTF8Encoding($false)))
    Write-Host '';Write-Host 'MAPA GENERADO CORRECTAMENTE' -ForegroundColor Green;Write-Host "Archivo: $salida" -ForegroundColor White
} catch { Write-Host '';Write-Host 'NO SE GENERO EL MAPA:' -ForegroundColor Red;Write-Host $_.Exception.Message -ForegroundColor Yellow;if(-not$SinPausa){Read-Host 'Presiona ENTER para cerrar'};exit 1 }
if(-not$SinPausa){Read-Host 'Presiona ENTER para cerrar'}
