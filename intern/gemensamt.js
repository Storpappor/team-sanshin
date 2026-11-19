/* Gemensamt för instruktörssidan och adminsidan: anrop till servern, datum och meddelanden. */
var API = '../api/index.php';
var DAGAR = ['sön','mån','tis','ons','tor','fre','lör'];
var MANADER = ['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];

function hamta(vad, data) {
  var opt = {credentials: 'same-origin', headers: {}};
  if (data) { opt.method = 'POST'; opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(data); }
  return fetch(API + '?do=' + vad, opt).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok) { var e = new Error(j.fel || 'Något gick fel. Försök igen.'); e.status = r.status; throw e; }
      return j;
    });
  }, function () { throw new Error('Ingen kontakt med servern. Kolla uppkopplingen och försök igen.'); });
}

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function dag(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function datumtext(s) { var d = dag(s); return DAGAR[d.getDay()] + ' ' + d.getDate() + ' ' + MANADER[d.getMonth()]; }
function vecka(s) {
  var d = dag(s), t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), w = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - w);
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}

var toastTimer;
function meddela(text, fel) {
  var t = document.getElementById('toast');
  t.textContent = text;
  t.classList.toggle('bad', !!fel);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, fel ? 4000 : 2400);
}
