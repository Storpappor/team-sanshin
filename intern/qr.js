/* QR-koder utan utomstående tjänster.
   Byte-läge, felkorrigering M (cirka 15 %), version 1–6, alltså upp till cirka 100 tecken. Räcker gott för webbadresser.
   Följer standarden ISO/IEC 18004. Användning: var qr = QR.skapa('https://...'); qr.storlek, qr.svart(x, y), QR.svg(qr). */
var QR = (function () {
  // Per version (1–6), nivå M: [felkorrigeringsord per block, antal block, dataord per block]
  var BLOCK = [null, [10, 1, 16], [16, 1, 28], [26, 1, 44], [18, 2, 32], [24, 2, 43], [16, 4, 27]];
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

  function skapa(text) {
    var bytes = utf8(text), v, b;
    for (v = 1; v <= 6; v++) {
      b = BLOCK[v];
      if (4 + 8 + bytes.length * 8 <= b[1] * b[2] * 8) break;
    }
    if (v > 6) throw new Error('För lång text för QR-koden.');
    var dataOrd = b[1] * b[2], storlek = 17 + 4 * v;

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
    var del = delare(b[0]), block = [], fk = [];
    for (i = 0; i < b[1]; i++) {
      var d = ord.slice(i * b[2], (i + 1) * b[2]);
      block.push(d); fk.push(rest(d, del));
    }
    var alla = [];
    for (i = 0; i < b[2]; i++) block.forEach(function (d) { alla.push(d[i]); });
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
      var data = (0 << 3) | mask, r = data; // nivå M har formatbitarna 00
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

    return { storlek: storlek, version: v, mask: basta, svart: function (x, y) { return m[y][x]; } };
  }

  // SVG med vit marginal på fyra moduler, som standarden kräver.
  function svg(qr, marginal) {
    marginal = marginal == null ? 4 : marginal;
    var s = qr.storlek + marginal * 2, d = [];
    for (var y = 0; y < qr.storlek; y++) for (var x = 0; x < qr.storlek; x++) {
      if (qr.svart(x, y)) d.push('M' + (x + marginal) + ' ' + (y + marginal) + 'h1v1h-1z');
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + ' ' + s + '" shape-rendering="crispEdges">' +
      '<rect width="100%" height="100%" fill="#fff"/><path fill="#000" d="' + d.join('') + '"/></svg>';
  }

  // PNG via canvas, för att kunna skriva ut eller lägga in i en affisch.
  function png(qr, pixlarPerModul, marginal) {
    marginal = marginal == null ? 4 : marginal;
    var p = pixlarPerModul || 20, s = (qr.storlek + marginal * 2) * p, c = document.createElement('canvas');
    c.width = c.height = s;
    var g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, s, s); g.fillStyle = '#000';
    for (var y = 0; y < qr.storlek; y++) for (var x = 0; x < qr.storlek; x++) if (qr.svart(x, y)) g.fillRect((x + marginal) * p, (y + marginal) * p, p, p);
    return c.toDataURL('image/png');
  }

  return { skapa: skapa, svg: svg, png: png };
})();
