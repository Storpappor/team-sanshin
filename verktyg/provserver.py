"""Låtsasserver för att prova sajten på den egna datorn.

Hos Loopia körs PHP-koden i api/. Den här filen gör samma sak i Python, så att
sidorna går att prova utan att PHP är installerat:
  - visar sajtens filer på http://localhost:8080
  - svarar på api/index.php och api/paminnelse.php på samma sätt som PHP-koden
  - sparar allt i data/prov.sqlite
  - skickar inga mejl, utan lägger dem som filer i data/mejl/

Starta:  python verktyg/provserver.py
Lösenordet till adminsidan skapas första gången och ligger i verktyg/provserver-losen.txt.
"""
import base64, csv, io, json, os, re, secrets, sqlite3, sys, threading, time
from datetime import date, datetime, timedelta
from email.message import EmailMessage
from email.utils import formatdate
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

ROT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROT, 'data')
DB = os.path.join(DATA, 'prov.sqlite')
MEJL = os.path.join(DATA, 'mejl')
LOSENFIL = os.path.join(ROT, 'verktyg', 'provserver-losen.txt')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
SAJT_URL = f'http://localhost:{PORT}'
KLUBBEN = 'info@teamsanshin.se'
PAMINN_DAGAR = 3

ARENDEN = {'termin': 'Anmälan till terminen', 'prov': 'Provträning', 'present': 'Presentkort'}
VEM = {'barn': 'Barn', 'ungdom': 'Ungdom', 'du': 'Vuxen (sig själv)'}
DAGAR = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön']
MAN = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
EPOST = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

# Klubbens träningsschema, samma som i schema.js: (veckodag 1 = måndag, tid, grupp, kategori)
SCHEMA = [
    (1, '16.30–17.30', 'Barn nybörjare', 'barn'), (1, '17.30–18.30', 'Ungdomsgrupp', 'ungdom'), (1, '18.30–19.30', 'Vuxengrupp', 'vuxna'),
    (2, '16.30–17.30', 'Barn fortsättning 1', 'barn'), (2, '17.30–18.30', 'Barn fortsättning 2', 'barn'), (2, '18.30–19.30', 'Vuxna / Ungdom kumite', 'ungdom-vuxna'),
    (4, '16.30–17.30', 'Barn fortsättning 2', 'barn'), (4, '17.30–18.30', 'Ungdomsgrupp', 'ungdom'), (4, '18.30–19.30', 'Vuxengrupp', 'vuxna'),
]
KATEGORIER = {'barn': 'Barn', 'ungdom': 'Ungdom', 'vuxna': 'Vuxna', 'ungdom-vuxna': 'Vuxna och ungdom'}

las = threading.Lock()
sessioner = set()


class Fel(Exception):
    def __init__(self, text, kod=400):
        super().__init__(text)
        self.kod = kod


def admin_losen():
    if not os.path.exists(LOSENFIL):
        with open(LOSENFIL, 'w', encoding='utf-8') as f:
            f.write(secrets.token_urlsafe(9))
    with open(LOSENFIL, encoding='utf-8') as f:
        return f.read().strip()


def db():
    ny = not os.path.exists(DB)
    os.makedirs(DATA, exist_ok=True)
    c = sqlite3.connect(DB)
    c.row_factory = sqlite3.Row
    if ny:
        c.executescript('''
          CREATE TABLE pass_mall (id INTEGER PRIMARY KEY AUTOINCREMENT, veckodag INT NOT NULL, tid TEXT NOT NULL, grupp TEXT NOT NULL, kategori TEXT NOT NULL DEFAULT 'barn', fran TEXT, till TEXT);
          CREATE TABLE pass_installt (pass TEXT PRIMARY KEY, orsak TEXT);
          CREATE TABLE instruktor (id INTEGER PRIMARY KEY AUTOINCREMENT, namn TEXT NOT NULL, epost TEXT, kod TEXT NOT NULL UNIQUE);
          CREATE TABLE bemanning (pass TEXT NOT NULL, instruktor_id INT NOT NULL, PRIMARY KEY (pass, instruktor_id));
          CREATE TABLE anmalan (id INTEGER PRIMARY KEY AUTOINCREMENT, skapad TEXT NOT NULL, arende TEXT NOT NULL, vem TEXT NOT NULL, alder TEXT, namn TEXT NOT NULL, epost TEXT NOT NULL, mobil TEXT, klar INT NOT NULL DEFAULT 0);
          CREATE TABLE paminnelse (pass TEXT PRIMARY KEY, skickad TEXT NOT NULL);
        ''')
        c.executemany('INSERT INTO pass_mall (veckodag, tid, grupp, kategori) VALUES (?, ?, ?, ?)', SCHEMA)
        for x in 'ABC':
            c.execute('INSERT INTO instruktor (namn, epost, kod) VALUES (?, ?, ?)',
                      (f'Instruktör {x}', f'instruktor-{x.lower()}@example.com', secrets.token_hex(12)))
        c.commit()
    return c


def nu():
    return datetime.now().strftime('%Y-%m-%d %H:%M:%S')


def kommande_pass(c, dagar, fran=None):
    mallar = c.execute('SELECT * FROM pass_mall ORDER BY tid').fetchall()
    installt = {r[0]: r[1] or '' for r in c.execute('SELECT pass, orsak FROM pass_installt')}
    ledare = {}
    for r in c.execute('SELECT b.pass, i.id, i.namn FROM bemanning b JOIN instruktor i ON i.id = b.instruktor_id ORDER BY i.namn'):
        ledare.setdefault(r['pass'], []).append({'id': r['id'], 'namn': r['namn']})
    ut, d = [], fran or date.today()
    for _ in range(dagar):
        ds = d.isoformat()
        for m in mallar:
            if m['veckodag'] != d.isoweekday() or (m['fran'] and ds < m['fran']) or (m['till'] and ds > m['till']):
                continue
            pid = f"{ds}_{m['id']}"
            ut.append({'id': pid, 'datum': ds, 'tid': m['tid'], 'grupp': m['grupp'], 'kategori': m['kategori'],
                       'extra': m['fran'] is not None and m['fran'] == m['till'],
                       'installt': pid in installt, 'orsak': installt.get(pid, ''), 'ledare': ledare.get(pid, [])})
        d += timedelta(days=1)
    return ut


def rensa_mall(c, mall, fran='0000-00-00'):
    for tabell in ('bemanning', 'pass_installt', 'paminnelse'):
        for (p,) in c.execute(f'SELECT DISTINCT pass FROM {tabell}').fetchall():
            if p.endswith(f'_{mall}') and p[:10] >= fran:
                c.execute(f'DELETE FROM {tabell} WHERE pass = ?', (p,))


def ta_bort_mall(c, mid):
    m = c.execute('SELECT * FROM pass_mall WHERE id = ?', (mid,)).fetchone()
    if not m:
        return
    idag = date.today().isoformat()
    if m['fran'] is not None and m['fran'] >= idag:
        rensa_mall(c, mid)
        c.execute('DELETE FROM pass_mall WHERE id = ?', (mid,))
        return
    rensa_mall(c, mid, idag)
    if m['till'] is None or m['till'] >= idag:
        c.execute('UPDATE pass_mall SET till = ? WHERE id = ?', ((date.today() - timedelta(days=1)).isoformat(), mid))


def instruktor_historik(c, fran, till):
    mallar = {m['id']: m for m in c.execute('SELECT * FROM pass_mall')}
    installt = {r[0] for r in c.execute('SELECT pass FROM pass_installt')}
    ut = {i['id']: {'id': i['id'], 'namn': i['namn'], 'pass': []} for i in c.execute('SELECT id, namn FROM instruktor ORDER BY namn')}
    for b in c.execute('SELECT pass, instruktor_id FROM bemanning'):
        datum, _, mid = b['pass'].partition('_')
        m = mallar.get(int(mid) if mid.isdigit() else -1)
        if not m or datum < fran or datum > till or b['pass'] in installt or b['instruktor_id'] not in ut:
            continue
        ut[b['instruktor_id']]['pass'].append({'datum': datum, 'tid': m['tid'], 'grupp': m['grupp']})
    lista = list(ut.values())
    for i in lista:
        i['pass'].sort(key=lambda p: p['datum'] + p['tid'])
        i['antal'] = len(i['pass'])
    lista.sort(key=lambda i: (-i['antal'], i['namn']))
    return lista


def period(q):
    def ok(s):
        try:
            return bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', s)) and bool(date.fromisoformat(s))
        except ValueError:
            return False
    fran, till = q.get('fran', ''), q.get('till', '')
    if not ok(fran): fran = f'{date.today().year}-01-01'
    if not ok(till): till = date.today().isoformat()
    if till < fran: raise Fel('Slutdatumet måste vara efter startdatumet.')
    return fran, till


def las_mall(d):
    def ar_datum(s):
        try:
            date.fromisoformat(s)
            return bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', s))
        except ValueError:
            return False
    tid = re.compile(r'([01]\d|2[0-3])[.:][0-5]\d')
    start, slut = str(d.get('start', '')), str(d.get('slut', ''))
    if not tid.fullmatch(start) or not tid.fullmatch(slut): raise Fel('Fyll i start- och sluttid.')
    start, slut = start.replace(':', '.'), slut.replace(':', '.')
    if slut <= start: raise Fel('Sluttiden måste vara efter starttiden.')
    grupp = str(d.get('grupp', '')).strip()
    if not grupp or len(grupp) > 100: raise Fel('Skriv vilken grupp passet är för.')
    kategori = str(d.get('kategori', ''))
    if kategori not in KATEGORIER: raise Fel('Välj barn, ungdom eller vuxna.')
    if d.get('extra'):
        dag = str(d.get('datum', ''))
        if not ar_datum(dag): raise Fel('Välj ett datum.')
        veckodag, fran, till = date.fromisoformat(dag).isoweekday(), dag, dag
    else:
        try:
            veckodag = int(d.get('veckodag') or 0)
        except (TypeError, ValueError):
            veckodag = 0
        if not 1 <= veckodag <= 7: raise Fel('Välj veckodag.')
        fran, till = str(d.get('fran') or '') or None, str(d.get('till') or '') or None
        if (fran and not ar_datum(fran)) or (till and not ar_datum(till)): raise Fel('Datumet ser inte rätt ut.')
        if fran and till and till <= fran: raise Fel('Slutdatumet måste vara efter startdatumet.')
    return (veckodag, f'{start}–{slut}', grupp, kategori, fran, till)


def hitta_pass(c, pid):
    for p in kommande_pass(c, 60):
        if p['id'] == pid:
            return p
    raise Fel('Passet finns inte.', 404)


def passtext(p):
    d = date.fromisoformat(p['datum'])
    return f"{DAGAR[d.weekday()]} {d.day} {MAN[d.month - 1]} {p['tid']}, {p['grupp']}"


def skicka_mejl(till, amne, text):
    if not EPOST.match(till or ''):
        return False
    m = EmailMessage()
    m['Date'] = formatdate(localtime=True)
    m['From'] = f'Team Sanshin <{KLUBBEN}>'
    m['To'] = till
    m['Subject'] = amne
    m.set_content(text)
    os.makedirs(MEJL, exist_ok=True)
    namn = datetime.now().strftime('%Y-%m-%d_%H%M%S') + '_' + secrets.token_hex(3) + '.eml'
    with open(os.path.join(MEJL, namn), 'wb') as f:
        f.write(bytes(m))
    return True


def vem_text(vem):
    return ', '.join(VEM.get(v, v) for v in vem.split(',') if v)


def ta_emot_anmalan(c, d):
    if str(d.get('webbplats', '')).strip() or int(d.get('tid') or 0) < 3000:
        return {'ok': True}
    arende = str(d.get('arende', ''))
    vem = [v for v in VEM if v in (d.get('vem') or [])]
    alder = str(d.get('alder', '')).strip()
    namn = str(d.get('namn', '')).strip()
    epost = str(d.get('epost', '')).strip()
    mobil = str(d.get('mobil', '')).strip()
    if arende not in ARENDEN: raise Fel('Välj vad ni vill göra.')
    if not vem: raise Fel('Välj vem som ska träna.')
    if not namn or len(namn) > 100: raise Fel('Fyll i ditt namn.')
    if not EPOST.match(epost) or len(epost) > 200: raise Fel('Fyll i en giltig e-postadress.')
    if mobil and not re.fullmatch(r'[0-9 +()\-]{5,40}', mobil): raise Fel('Mobilnumret ser inte rätt ut.')
    if alder and (not alder.isdigit() or not 1 <= int(alder) <= 99): raise Fel('Åldern ser inte rätt ut.')
    if not set(vem) & {'barn', 'ungdom'}: alder = ''
    c.execute('INSERT INTO anmalan (skapad, arende, vem, alder, namn, epost, mobil, klar) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
              (nu(), arende, ','.join(vem), alder or None, namn, epost, mobil or None))
    c.commit()
    s = (f"Ärende: {ARENDEN[arende]}\nVem ska träna: {vem_text(','.join(vem))}\n"
         + (f"Barnets ålder: {alder} år\n" if alder else '')
         + f"Namn: {namn}\nE-post: {epost}\n" + (f"Mobil: {mobil}\n" if mobil else ''))
    skicka_mejl(KLUBBEN, f'Ny anmälan: {ARENDEN[arende]} – {namn}',
                f"En ny anmälan har kommit in via sajten.\n\n{s}\nAlla anmälningar finns på adminsidan:\n{SAJT_URL}/admin/\n")
    skicka_mejl(epost, 'Vi har fått din anmälan – Team Sanshin',
                f"Hej {namn}!\n\nTack för din anmälan till Team Sanshin. Vi har tagit emot den och hör av oss.\n\n"
                f"Det här skickade du:\n{s}\n"
                "Vill du ändra något eller att vi tar bort dina uppgifter? Svara på det här mejlet.\n\n"
                "Team Sanshin\nBjörngårdsgatan 15, 118 52 Stockholm\n")
    return {'ok': True}


def paminnelse(c):
    redan = {r[0] for r in c.execute('SELECT pass FROM paminnelse')}
    tomma = [p for p in kommande_pass(c, PAMINN_DAGAR + 1) if not p['installt'] and not p['ledare'] and p['id'] not in redan]
    skickade = 0
    if tomma:
        lista = '\n'.join('- ' + passtext(p) for p in tomma)
        for i in c.execute('SELECT * FROM instruktor WHERE epost IS NOT NULL').fetchall():
            if skicka_mejl(i['epost'], 'Pass som saknar instruktör',
                           f"Hej {i['namn']}!\n\nDe här passen saknar fortfarande instruktör:\n\n{lista}\n\n"
                           "Kan du ta något av dem? Svara på det här mejlet så sätter vi upp dig.\n\nTack!\nTeam Sanshin\n"):
                skickade += 1
        c.executemany('INSERT INTO paminnelse (pass, skickad) VALUES (?, ?)', [(p['id'], nu()) for p in tomma])
        c.commit()
    return {'pass_utan_instruktor': len(tomma), 'mejl_skickade': skickade}


class Hanterare(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROT, **k)

    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (self.command, self.path.split('?')[0]))

    # ----- svar -----
    def json(self, data, kod=200, cookie=None):
        b = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(kod)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(b)))
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(b)

    def session(self):
        c = SimpleCookie(self.headers.get('Cookie', ''))
        return c['sanshin_admin'].value if 'sanshin_admin' in c else None

    def krav_admin(self):
        if self.session() not in sessioner:
            raise Fel('Logga in först.', 401)

    # ----- vägval -----
    def do_GET(self):
        u = urlparse(self.path)
        if u.path.startswith('/data/') or (u.path.startswith('/api/') and u.path not in ('/api/index.php', '/api/paminnelse.php')) or u.path.startswith('/verktyg/'):
            return self.send_error(403)
        if u.path in ('/api/index.php', '/api/paminnelse.php'):
            return self.api('GET', u)
        return super().do_GET()

    def do_POST(self):
        u = urlparse(self.path)
        if u.path != '/api/index.php':
            return self.send_error(404)
        return self.api('POST', u)

    def api(self, metod, u):
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        try:
            with las:
                c = db()
                try:
                    if u.path == '/api/paminnelse.php':
                        return self.json(paminnelse(c))
                    d = {}
                    if metod == 'POST':
                        if 'application/json' not in self.headers.get('Content-Type', ''):
                            raise Fel('Fel format.', 415)
                        n = int(self.headers.get('Content-Length') or 0)
                        try:
                            d = json.loads(self.rfile.read(n) or b'{}')
                        except ValueError:
                            raise Fel('Fel format.')
                        if not isinstance(d, dict):
                            raise Fel('Fel format.')
                    return self.handling(c, metod, q.get('do', ''), q, d)
                finally:
                    c.close()
        except Fel as e:
            if e.kod == 401 and q.get('do') == 'login':
                time.sleep(1)
            self.json({'fel': str(e)}, e.kod)
        except Exception as e:  # noqa
            import traceback; traceback.print_exc()
            self.json({'fel': 'Något gick fel på servern.'}, 500)

    def handling(self, c, metod, do, q, d):
        nyckel = f'{metod} {do}'
        if nyckel == 'GET schema':
            try:
                n = max(0, min(12, int(q.get('vecka', 0))))
            except ValueError:
                n = 0
            idag = date.today()
            mandag = idag - timedelta(days=idag.weekday()) + timedelta(weeks=n)
            return self.json({
                'vecka': mandag.isocalendar()[1], 'fran': mandag.isoformat(),
                'till': (mandag + timedelta(days=6)).isoformat(), 'sista': n >= 12,
                'pass': [{'datum': p['datum'], 'tid': p['tid'], 'grupp': p['grupp'], 'kategori': p['kategori'],
                          'extra': p['extra'], 'installt': p['installt'], 'orsak': p['orsak'],
                          'ledare': [l['namn'] for l in p['ledare']]} for p in kommande_pass(c, 7, mandag)]})
        if nyckel == 'POST anmalan':
            return self.json(ta_emot_anmalan(c, d))
        if nyckel == 'POST login':
            if not secrets.compare_digest(str(d.get('losen', '')), admin_losen()):
                raise Fel('Fel lösenord.', 401)
            s = secrets.token_hex(16)
            sessioner.add(s)
            return self.json({'ok': True}, cookie=f'sanshin_admin={s}; Path=/; HttpOnly; SameSite=Strict')
        if nyckel == 'POST logout':
            sessioner.discard(self.session())
            return self.json({'ok': True}, cookie='sanshin_admin=; Path=/; Max-Age=0')

        self.krav_admin()
        if nyckel == 'GET admin':
            pass_ = kommande_pass(c, 28)
            antal = {}
            for p in pass_:
                for l in p['ledare']:
                    antal[l['id']] = antal.get(l['id'], 0) + 1
            instr = [{'id': i['id'], 'namn': i['namn'], 'epost': i['epost'], 'antal': antal.get(i['id'], 0)}
                     for i in c.execute('SELECT * FROM instruktor ORDER BY namn')]
            anm = [dict(a) | {'klar': bool(a['klar'])} for a in c.execute('SELECT * FROM anmalan ORDER BY id DESC')]
            mallar = [dict(m) for m in c.execute('SELECT * FROM pass_mall ORDER BY veckodag, tid')]
            return self.json({'pass': pass_, 'mallar': mallar, 'instruktorer': instr, 'anmalningar': anm})
        if nyckel == 'POST stall_in':
            p = hitta_pass(c, str(d.get('pass', '')))
            orsak = str(d.get('orsak', '')).strip()
            if len(orsak) > 200: raise Fel('Orsaken får vara högst 200 tecken.')
            c.execute('DELETE FROM pass_installt WHERE pass = ?', (p['id'],))
            if d.get('installt'):
                c.execute('INSERT INTO pass_installt (pass, orsak) VALUES (?, ?)', (p['id'], orsak or None))
            c.commit()
            return self.json({'ok': True})
        if nyckel == 'POST spara_mall':
            m = las_mall(d)
            if d.get('id'):
                c.execute('UPDATE pass_mall SET veckodag = ?, tid = ?, grupp = ?, kategori = ?, fran = ?, till = ? WHERE id = ?', m + (int(d['id']),))
            else:
                c.execute('INSERT INTO pass_mall (veckodag, tid, grupp, kategori, fran, till) VALUES (?, ?, ?, ?, ?, ?)', m)
            c.commit()
            return self.json({'ok': True})
        if nyckel == 'POST ta_bort_mall':
            ta_bort_mall(c, int(d.get('id') or 0))
            c.commit()
            return self.json({'ok': True})
        if nyckel == 'GET statistik':
            fran, till = period(q)
            return self.json({'fran': fran, 'till': till, 'instruktorer': instruktor_historik(c, fran, till)})
        if nyckel == 'GET excel_instruktorer':
            fran, till = period(q)
            hist = instruktor_historik(c, fran, till)
            manader, d0 = [], date.fromisoformat(fran[:7] + '-01')
            while d0.isoformat()[:7] <= till[:7]:
                manader.append(d0.isoformat()[:7])
                d0 = date(d0.year + (d0.month == 12), d0.month % 12 + 1, 1)
            f = io.StringIO()
            w = csv.writer(f, delimiter=';')
            skydda = lambda s: "'" + s if s[:1] in '=+-@' else s
            w.writerow([f'Pass per instruktör {fran} till {till} (inställda pass räknas inte)'])
            w.writerow(['Instruktör', 'Totalt'] + manader)
            for i in hist:
                per = {m: 0 for m in manader}
                for p in i['pass']:
                    per[p['datum'][:7]] = per.get(p['datum'][:7], 0) + 1
                w.writerow([skydda(i['namn']), i['antal']] + [per[m] for m in manader])
            w.writerow([])
            w.writerow(['Instruktör', 'Datum', 'Tid', 'Grupp'])
            for i in hist:
                for p in i['pass']:
                    w.writerow([skydda(i['namn']), p['datum'], p['tid'], skydda(p['grupp'])])
            b = ('﻿' + f.getvalue()).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/csv; charset=utf-8')
            self.send_header('Content-Disposition', f'attachment; filename="instruktorer-{fran}-till-{till}.csv"')
            self.send_header('Content-Length', str(len(b)))
            self.end_headers()
            self.wfile.write(b)
            return
        if nyckel == 'POST admin_bemanna':
            p = hitta_pass(c, str(d.get('pass', '')))
            i = int(d.get('instruktor') or 0)
            if not c.execute('SELECT id FROM instruktor WHERE id = ?', (i,)).fetchone():
                raise Fel('Instruktören finns inte.', 404)
            if d.get('kommer') and p['installt']:
                raise Fel('Passet är inställt.', 409)
            c.execute('DELETE FROM bemanning WHERE pass = ? AND instruktor_id = ?', (p['id'], i))
            if d.get('kommer'):
                c.execute('INSERT INTO bemanning (pass, instruktor_id) VALUES (?, ?)', (p['id'], i))
            else:
                c.execute('DELETE FROM paminnelse WHERE pass = ?', (p['id'],))
            c.commit()
            return self.json({'ok': True})
        if nyckel == 'POST ny_instruktor':
            namn, epost = str(d.get('namn', '')).strip(), str(d.get('epost', '')).strip()
            if not namn or len(namn) > 100: raise Fel('Skriv ett namn.')
            if epost and not EPOST.match(epost): raise Fel('E-postadressen ser inte rätt ut.')
            c.execute('INSERT INTO instruktor (namn, epost, kod) VALUES (?, ?, ?)', (namn, epost or None, secrets.token_hex(12)))
            c.commit()
            return self.json({'ok': True})
        if nyckel == 'POST andra_instruktor':
            namn, epost = str(d.get('namn', '')).strip(), str(d.get('epost', '')).strip()
            if not namn or len(namn) > 100: raise Fel('Skriv ett namn.')
            if epost and not EPOST.match(epost): raise Fel('E-postadressen ser inte rätt ut.')
            c.execute('UPDATE instruktor SET namn = ?, epost = ? WHERE id = ?', (namn, epost or None, int(d.get('id') or 0)))
            c.commit()
            return self.json({'ok': True})
        if nyckel == 'POST ta_bort_instruktor':
            i = int(d.get('id') or 0)
            c.execute('DELETE FROM bemanning WHERE instruktor_id = ?', (i,))
            c.execute('DELETE FROM instruktor WHERE id = ?', (i,))
            c.commit()
            return self.json({'ok': True})
        if nyckel == 'POST anmalan_klar':
            c.execute('UPDATE anmalan SET klar = ? WHERE id = ?', (1 if d.get('klar') else 0, int(d.get('id') or 0)))
            c.commit()
            return self.json({'ok': True})
        if nyckel == 'POST ta_bort_anmalan':
            c.execute('DELETE FROM anmalan WHERE id = ?', (int(d.get('id') or 0),))
            c.commit()
            return self.json({'ok': True})
        if nyckel == 'GET excel':
            f = io.StringIO()
            w = csv.writer(f, delimiter=';')
            w.writerow(['Datum', 'Ärende', 'Vem', 'Ålder', 'Namn', 'E-post', 'Mobil', 'Klar'])
            skydda = lambda s: "'" + s if s[:1] in '=+-@' else s
            for a in c.execute('SELECT * FROM anmalan ORDER BY id'):
                w.writerow([a['skapad'], ARENDEN.get(a['arende'], a['arende']), vem_text(a['vem']), a['alder'] or '',
                            skydda(a['namn']), a['epost'], skydda(a['mobil'] or ''), 'Ja' if a['klar'] else 'Nej'])
            b = ('\ufeff' + f.getvalue()).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/csv; charset=utf-8')
            self.send_header('Content-Disposition', f'attachment; filename="anmalningar-{date.today()}.csv"')
            self.send_header('Content-Length', str(len(b)))
            self.end_headers()
            self.wfile.write(b)
            return
        raise Fel('Okänd begäran.', 404)


if __name__ == '__main__':
    admin_losen()
    print(f'Provservern körs på {SAJT_URL}  (avsluta med Ctrl+C)')
    print(f'Lösenordet till {SAJT_URL}/admin/ finns i verktyg/provserver-losen.txt')
    ThreadingHTTPServer(('127.0.0.1', PORT), Hanterare).serve_forever()
