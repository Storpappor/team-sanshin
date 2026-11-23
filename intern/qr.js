/* QR-koder utan utomstående tjänster.
   Byte-läge, version 1–6, felkorrigering M (cirka 15 %), Q (25 %) eller H (30 %).
   Med H räcker det till cirka 58 tecken och tål en logga i mitten.
   Följer standarden ISO/IEC 18004. Användning: var qr = QR.skapa('https://...', 'H'); QR.svg(qr, {logga: true}). */
var QR = (function () {
  // Per nivå och version: [felkorrigeringsord per block, [[antal block, dataord per block], ...]]
  var BLOCK = {
    M: [null, [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]], [16, [[4, 27]]]],
    Q: [null, [13, [[1, 13]]], [22, [[1, 22]]], [18, [[2, 17]]], [26, [[2, 24]]], [18, [[2, 15], [2, 16]]], [24, [[4, 19]]]],
    H: [null, [17, [[1, 9]]], [28, [[1, 16]]], [22, [[2, 13]]], [16, [[4, 9]]], [22, [[2, 11], [2, 12]]], [28, [[4, 15]]]]
  };
  var FORMATBITAR = {M: 0, Q: 3, H: 2};
  var JUSTERING = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];

  // ----- Reed-Solomon i GF(256) med polynomet 0x11D -----
  function mult(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function delare(grad) {
    var r = [];
    for (var i = 0; i < grad - 1; i++) r.push(0);
    r.push(1);
    var rot = 1;
    for (i = 0; i < grad; i++) {
      for (var j = 0; j < r.length; j++) {
        r[j] = mult(r[j], rot);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      rot = mult(rot, 0x02);
    }
    return r;
  }
  function rest(data, del) {
    var r = del.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ r.shift();
      r.push(0);
      del.forEach(function (k, i) { r[i] ^= mult(k, f); });
    });
    return r;
  }

  function utf8(s) {
    var b = [], e = unescape(encodeURIComponent(s));
    for (var i = 0; i < e.length; i++) b.push(e.charCodeAt(i));
    return b;
  }

  function antalDataord(b) { return b[1].reduce(function (s, g) { return s + g[0] * g[1]; }, 0); }

  function skapa(text, niva) {
    niva = niva || 'M';
    if (!BLOCK[niva]) throw new Error('Okänd nivå: ' + niva);
    var bytes = utf8(text), v, b;
    for (v = 1; v <= 6; v++) {
      b = BLOCK[niva][v];
      if (4 + 8 + bytes.length * 8 <= antalDataord(b) * 8) break;
    }
    if (v > 6) throw new Error('För lång text för QR-koden.');
    var dataOrd = antalDataord(b), storlek = 17 + 4 * v;

    // ----- bitar: läge (byte), längd, data, slut och utfyllnad -----
    var bitar = [];
    function lagg(varde, n) { for (var i = n - 1; i >= 0; i--) bitar.push((varde >>> i) & 1); }
    lagg(4, 4); lagg(bytes.length, 8);
    bytes.forEach(function (x) { lagg(x, 8); });
    lagg(0, Math.min(4, dataOrd * 8 - bitar.length));
    while (bitar.length % 8) bitar.push(0);
    for (var pad = 0xEC; bitar.length < dataOrd * 8; pad ^= 0xEC ^ 0x11) lagg(pad, 8);
    var ord = [];
    for (var i = 0; i < bitar.length; i += 8) {
      var x = 0; for (var j = 0; j < 8; j++) x = (x << 1) | bitar[i + j]; ord.push(x);
    }

    // ----- dela i block, lägg till felkorrigering och fläta ihop -----
    var del = delare(b[0]), block = [], fk = [], start = 0, langst = 0;
    b[1].forEach(function (g) {
      for (var k = 0; k < g[0]; k++) {
        var d = ord.slice(start, start + g[1]); start += g[1];
        block.push(d); fk.push(rest(d, del)); langst = Math.max(langst, g[1]);
      }
    });
    var alla = [];
    for (i = 0; i < langst; i++) block.forEach(function (d) { if (i < d.length) alla.push(d[i]); });
    for (i = 0; i < b[0]; i++) fk.forEach(function (e) { alla.push(e[i]); });

    // ----- matris -----
    var m = [], fast = [];
    for (i = 0; i < storlek; i++) { m.push(new Array(storlek).fill(false)); fast.push(new Array(storlek).fill(false)); }
    function satt(x, y, svart) { m[y][x] = svart; fast[y][x] = true; }

    for (i = 0; i < storlek; i++) { satt(6, i, i % 2 === 0); satt(i, 6, i % 2 === 0); }
    [[3, 3], [storlek - 4, 3], [3, storlek - 4]].forEach(function (p) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var xx = p[0] + dx, yy = p[1] + dy, avst = Math.max(Math.abs(dx), Math.abs(dy));
        if (xx >= 0 && xx < storlek && yy >= 0 && yy < storlek) satt(xx, yy, avst !== 2 && avst !== 4);
      }
    });
    var pos = JUSTERING[v], sista = pos.length - 1;
    pos.forEach(function (px, a) {
      pos.forEach(function (py, c) {
        if ((a === 0 && c === 0) || (a === 0 && c === sista) || (a === sista && c === 0)) return;
        for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) satt(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      });
    });
    function format(mask) {
      var data = (FORMATBITAR[niva] << 3) | mask, r = data;
      for (var k = 0; k < 10; k++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      var f = ((data << 10) | r) ^ 0x5412, bit = function (n) { return ((f >>> n) & 1) !== 0; };
      for (k = 0; k <= 5; k++) satt(8, k, bit(k));
      satt(8, 7, bit(6)); satt(8, 8, bit(7)); satt(7, 8, bit(8));
      for (k = 9; k < 15; k++) satt(14 - k, 8, bit(k));
      for (k = 0; k < 8; k++) satt(storlek - 1 - k, 8, bit(k));
      for (k = 8; k < 15; k++) satt(8, storlek - 15 + k, bit(k));
      satt(8, storlek - 8, true);
    }
    format(0); // reserverar platsen för formatet

    // placera data i sicksack nedifrån höger
    var n = 0;
    for (var hoger = storlek - 1; hoger >= 1; hoger -= 2) {
      if (hoger === 6) hoger = 5;
      for (var vert = 0; vert < storlek; vert++) {
        for (j = 0; j < 2; j++) {
          var xx = hoger - j, uppat = ((hoger + 1) & 2) === 0, yy = uppat ? storlek - 1 - vert : vert;
          if (!fast[yy][xx] && n < alla.length * 8) {
            m[yy][xx] = ((alla[n >>> 3] >>> (7 - (n & 7))) & 1) !== 0;
            n++;
          }
        }
      }
    }

    // ----- mask: välj den som ger lägst straff -----
    var MASKER = [
      function (x, y) { return (x + y) % 2 === 0; },
      function (x, y) { return y % 2 === 0; },
      function (x) { return x % 3 === 0; },
      function (x, y) { return (x + y) % 3 === 0; },
      function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
      function (x, y) { return x * y % 2 + x * y % 3 === 0; },
      function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; },
      function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }
    ];
    function anvand(mask) {
      for (var y = 0; y < storlek; y++) for (var x = 0; x < storlek; x++) if (!fast[y][x] && MASKER[mask](x, y)) m[y][x] = !m[y][x];
    }
    function straff() {
      var p = 0, x, y, k, svarta = 0;
      function rad(get) {
        var langd = 1, s = 0;
        for (var i = 1; i < storlek; i++) {
          if (get(i) === get(i - 1)) { langd++; if (langd === 5) s += 3; else if (langd > 5) s += 1; }
          else langd = 1;
        }
        var monster = [true, false, true, true, true, false, true];
        for (i = 0; i + 7 <= storlek; i++) {
          var ok = true;
          for (var q = 0; q < 7; q++) if (get(i + q) !== monster[q]) { ok = false; break; }
          if (!ok) continue;
          var fore = true, efter = true;
          for (q = 1; q <= 4; q++) { if (i - q >= 0 && get(i - q)) fore = false; if (i + 6 + q < storlek && get(i + 6 + q)) efter = false; }
          if (fore || efter) s += 40;
        }
        return s;
      }
      for (k = 0; k < storlek; k++) {
        p += rad(function (i) { return m[k][i]; });
        p += rad(function (i) { return m[i][k]; });
      }
      for (y = 0; y < storlek - 1; y++) for (x = 0; x < storlek - 1; x++) {
        var c = m[y][x];
        if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
      }
      for (y = 0; y < storlek; y++) for (x = 0; x < storlek; x++) if (m[y][x]) svarta++;
      p += Math.floor(Math.abs(svarta * 20 - storlek * storlek * 10) / (storlek * storlek)) * 10;
      return p;
    }
    var basta = 0, minst = Infinity;
    for (var mk = 0; mk < 8; mk++) {
      anvand(mk); format(mk);
      var s = straff();
      if (s < minst) { minst = s; basta = mk; }
      anvand(mk); // ta bort masken igen
    }
    anvand(basta); format(basta);

    return { storlek: storlek, version: v, niva: niva, mask: basta, svart: function (x, y) { return m[y][x]; } };
  }

  // Rutan i mitten där loggan ligger, i moduler. Ungefär en femtedel av bredden, alltid ett udda antal.
  function loggaRuta(qr) {
    var n = Math.round(qr.storlek * 0.22);
    if (n % 2 === 0) n++;
    var x0 = (qr.storlek - n) / 2;
    return {x0: x0, y0: x0, n: n};
  }

  // Karatesiluett (framåtslag i framåtställning), ritad i en ruta på 100 x 100.
  var SILUETT =
    '<g fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    '<path stroke="#5B2BD6" stroke-width="10" d="M40 36 L38 58 M41 38 L80 38 M41 38 L27 47 L35 55 M38 58 L60 70 L67 88 M38 58 L16 88"/>' +
    '<path stroke="#101014" stroke-width="5" d="M30 56 L47 58 M44 58 L41 68"/>' +
    '</g><circle cx="41" cy="22" r="9" fill="#5B2BD6"/>';

  // SVG med vit marginal på fyra moduler, som standarden kräver. Med {logga: true} läggs siluetten i mitten.
  function svg(qr, val) {
    val = val || {};
    var marginal = val.marginal == null ? 4 : val.marginal;
    var s = qr.storlek + marginal * 2, d = [], r = val.logga ? loggaRuta(qr) : null;
    function iRutan(x, y) { return r && x >= r.x0 && x < r.x0 + r.n && y >= r.y0 && y < r.y0 + r.n; }
    for (var y = 0; y < qr.storlek; y++) for (var x = 0; x < qr.storlek; x++) {
      if (qr.svart(x, y) && !iRutan(x, y)) d.push('M' + (x + marginal) + ' ' + (y + marginal) + 'h1v1h-1z');
    }
    var logga = '';
    if (r) {
      var lx = r.x0 + marginal, ly = r.y0 + marginal, inre = r.n - 1;
      if (typeof val.logga === 'string') {
        // En egen bild, till exempel klubbens emblem (som data-adress, så att filen blir fristående).
        logga = '<rect x="' + lx + '" y="' + ly + '" width="' + r.n + '" height="' + r.n + '" fill="#fff"/>' +
          '<image x="' + (lx + 0.4) + '" y="' + (ly + 0.4) + '" width="' + (r.n - 0.8) + '" height="' + (r.n - 0.8) + '" preserveAspectRatio="xMidYMid meet" href="' + val.logga + '"/>';
      } else {
        logga = '<rect x="' + (lx + 0.15) + '" y="' + (ly + 0.15) + '" width="' + (r.n - 0.3) + '" height="' + (r.n - 0.3) + '" rx="1.2" fill="#fff" stroke="#5B2BD6" stroke-width="0.3"/>' +
          '<g transform="translate(' + (lx + 0.5) + ' ' + (ly + 0.5) + ') scale(' + (inre / 100) + ')">' + SILUETT + '</g>';
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + ' ' + s + '">' +
      '<rect width="100%" height="100%" fill="#fff"/><path fill="#000" shape-rendering="crispEdges" d="' + d.join('') + '"/>' + logga + '</svg>';
  }

  // PNG via canvas, för att kunna skriva ut eller lägga in i en affisch. Anropar klar(dataUrl) när bilden är ritad.
  function png(qr, val, klar) {
    val = val || {};
    var marginal = val.marginal == null ? 4 : val.marginal, p = val.pixlarPerModul || 20;
    var s = (qr.storlek + marginal * 2) * p, c = document.createElement('canvas'), bild = new Image();
    c.width = c.height = s;
    bild.onload = function () {
      var g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
      g.imageSmoothingEnabled = false;
      g.drawImage(bild, 0, 0, s, s);
      klar(c.toDataURL('image/png'));
    };
    bild.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(qr, val));
  }

  return { skapa: skapa, svg: svg, png: png, loggaRuta: loggaRuta };
})();
