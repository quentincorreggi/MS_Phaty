// ============================================================
// ad-export.js — In-browser playable ad HTML export (dev tool)
// ============================================================

var AD_EXPORT_SKIP = { 'editor.js': true, 'calibration.js': true, 'ad-export.js': true };

function adExportScriptBasename(src) {
  var path = (src || '').split('?')[0];
  var parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function adExportCollectScriptUrls() {
  var list = [];
  var nodes = document.querySelectorAll('script[src]');
  for (var i = 0; i < nodes.length; i++) {
    var src = nodes[i].getAttribute('src');
    if (!src) continue;
    var base = adExportScriptBasename(src);
    if (AD_EXPORT_SKIP[base]) continue;
    try {
      list.push(new URL(src, document.baseURI).href);
    } catch (e) {
      list.push(src);
    }
  }
  return list;
}

function adExportFetchTextSequential(urls) {
  return urls.reduce(function (chain, url) {
    return chain.then(function (parts) {
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error('Failed to fetch ' + url + ' (' + r.status + ')');
        return r.text().then(function (t) {
          parts.push(t);
          return parts;
        });
      });
    });
  }, Promise.resolve([]));
}

function adExportSanitizeBundle(js) {
  return js.replace(/<\/script>/gi, '<\\/script>');
}

function adExportCssFromPage() {
  var el = document.querySelector('style');
  var css = el ? el.textContent : '';
  css = css.replace(/@import\s+url\([^)]+\)\s*;?/gi, '');
  css = css.replace(/font-family:\s*'Fredoka',\s*sans-serif/gi,
    "font-family:'Arial Rounded MT Bold','Nunito',-apple-system,'Segoe UI',sans-serif");
  return css;
}

function adExportBuildHtml(bakedLevel, gameBundle) {
  var css = adExportCssFromPage();
  var levelJson = JSON.stringify(bakedLevel);
  var safeBundle = adExportSanitizeBundle(gameBundle);

  var boot = [
    'var __BAKED_LEVEL = ' + levelJson + ';',
    'LEVELS.push(__BAKED_LEVEL);',
    'resize();',
    'gameActive = true;',
    "document.getElementById('level-screen').classList.add('hidden');",
    'startLevel(0);',
    "document.getElementById('cal-toggle').style.display = 'none';",
    "showLevelSelect = function () {",
    "  gameActive = false;",
    "  document.getElementById('level-screen').classList.add('hidden');",
    "  document.getElementById('win-screen').classList.add('show');",
    '};',
    'function ctaClick() {',
    "  window.open('https://example.com/store', '_blank');",
    '}',
    'frame();'
  ].join('\n');

  var s = '<script>';
  var sEnd = '</' + 'script>';

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1.0,user-scalable=no">',
    '<title>Marble Sorter — Playable Ad</title>',
    '<style>',
    css,
    '</style>',
    '</head>',
    '<body>',
    '<canvas id="game"></canvas>',
    '<div id="cal-toggle" style="display:none"></div>',
    '<div id="cal-panel" style="display:none"></div>',
    '<div id="level-screen" class="hidden"></div>',
    '<div id="win-screen">',
    '<h1>You Win!</h1>',
    '<p id="win-msg">All marbles sorted — get the full game!</p>',
    '<button type="button" onclick="ctaClick()">Download Now!</button>',
    '</div>',
    s + 'var AD_MODE = true;' + sEnd,
    s + safeBundle + sEnd,
    s + adExportSanitizeBundle(boot) + sEnd,
    '</body>',
    '</html>'
  ].join('\n');
}

function editorExportPlayableAd() {
  var total = 0;
  for (var i = 0; i < 49; i++) if (editor.grid[i]) total++;
  if (total === 0) {
    editorShowToast('Place some boxes first!');
    return;
  }

  var bakedLevel = editorBuildLevel();
  var urls = adExportCollectScriptUrls();
  if (urls.length === 0) {
    editorShowToast('No game scripts found to export.');
    return;
  }

  editorShowToast('Building ad…');

  adExportFetchTextSequential(urls)
    .then(function (parts) {
      var gameBundle = parts.join('\n\n');
      var html = adExportBuildHtml(bakedLevel, gameBundle);
      var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ad-playable.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      editorShowToast('Downloaded ad-playable.html');
    })
    .catch(function (err) {
      editorShowToast('Export failed (use a local server or GitHub Pages)');
      if (typeof console !== 'undefined' && console.error) console.error(err);
    });
}
