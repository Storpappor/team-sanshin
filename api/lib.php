<?php
// Gemensamma funktioner för servern: inställningar, databas, pass och mejl.
declare(strict_types=1);
date_default_timezone_set('Europe/Stockholm');

const ARENDEN = ['termin' => 'Anmälan till terminen', 'prov' => 'Provträning', 'present' => 'Presentkort'];
const VEM     = ['barn' => 'Barn', 'ungdom' => 'Ungdom', 'du' => 'Vuxen (sig själv)'];
// Vilken grupp ett pass är för. Styr etiketten och färgen i schemat på sajten.
const KATEGORIER = ['barn' => 'Barn', 'ungdom' => 'Ungdom', 'vuxna' => 'Vuxna', 'ungdom-vuxna' => 'Vuxna och ungdom'];

// ---------- svar ----------
function svara(array $data, int $kod = 200): never {
    http_response_code($kod);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function konfig(): array {
    static $k = null;
    if ($k === null) {
        $fil = __DIR__ . '/config.local.php';
        if (!is_file($fil)) svara(['fel' => 'Servern saknar inställningar.'], 500);
        $k = require $fil;
    }
    return $k;
}

function nu(): string { return date('Y-m-d H:i:s'); }

// ---------- databas ----------
function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $d = konfig()['db'];
    if (str_starts_with($d['dsn'], 'sqlite:')) {
        $mapp = dirname(substr($d['dsn'], 7));
        if (!is_dir($mapp)) mkdir($mapp, 0700, true);
    }
    $pdo = new PDO($d['dsn'], $d['anv'] ?? null, $d['losen'] ?? null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    skapa_tabeller($pdo);
    uppgradera_tabeller($pdo);
    return $pdo;
}

// Tabeller som har tillkommit efter att databasen skapades första gången.
function uppgradera_tabeller(PDO $pdo): void {
    try { $pdo->query('SELECT 1 FROM overgang LIMIT 1'); return; } catch (PDOException $e) { /* finns inte än */ }
    $mysql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    $id = $mysql ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $slut = $mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
    // Nuvarande medlemmar som går över från den gamla klubben.
    $pdo->exec("CREATE TABLE overgang (id $id, skapad VARCHAR(19) NOT NULL, namn VARCHAR(100) NOT NULL, personnummer VARCHAR(12) NOT NULL, grupp VARCHAR(100) NOT NULL, malsman VARCHAR(100), epost VARCHAR(200) NOT NULL, mobil VARCHAR(40), klar INT NOT NULL DEFAULT 0)$slut");
}

// ---------- personnummer ----------
// Gör om till tolv siffror (ÅÅÅÅMMDDNNNN) och kontrollerar datum och kontrollsiffra. Samordningsnummer godtas.
function normalisera_personnummer(string $s): ?string {
    $s = trim($s);
    if (!preg_match('/^(\d{2})?(\d{6})([-+]?)(\d{4})$/', str_replace(' ', '', $s), $m)) return null;
    [$_, $sekel, $datum, $tecken, $sista] = $m;
    $tio = $datum . $sista;
    // Kontrollsiffra (Luhn) över de tio sista siffrorna.
    $summa = 0;
    for ($i = 0; $i < 10; $i++) {
        $v = (int)$tio[$i] * ($i % 2 === 0 ? 2 : 1);
        $summa += $v > 9 ? $v - 9 : $v;
    }
    if ($summa % 10 !== 0) return null;
    $ar = (int)substr($datum, 0, 2);
    if ($sekel === '') {
        $nu = (int)date('Y');
        $ar4 = (int)(floor($nu / 100) * 100) + $ar;
        if ($ar4 > $nu) $ar4 -= 100;
        if ($tecken === '+') $ar4 -= 100;
    } else {
        $ar4 = (int)($sekel . substr($datum, 0, 2));
    }
    $man = (int)substr($datum, 2, 2);
    $dag = (int)substr($datum, 4, 2);
    if ($dag > 60) $dag -= 60; // samordningsnummer
    if (!checkdate($man, $dag, $ar4) || $ar4 > (int)date('Y') || $ar4 < (int)date('Y') - 110) return null;
    return sprintf('%04d', $ar4) . substr($datum, 2) . $sista;
}

function alder_fran_personnummer(string $pnr12): int {
    $dag = (int)substr($pnr12, 6, 2);
    if ($dag > 60) $dag -= 60;
    $fodd = new DateTimeImmutable(sprintf('%s-%s-%02d', substr($pnr12, 0, 4), substr($pnr12, 4, 2), $dag));
    return $fodd->diff(new DateTimeImmutable('today'))->y;
}

// Visar bara födelsedatum, till exempel 20150312-****.
function dolt_personnummer(string $pnr12): string {
    return substr($pnr12, 0, 8) . '-****';
}

// Grupperna i det veckoschema som gäller nu och framåt.
function aktuella_grupper(): array {
    $st = db()->prepare('SELECT DISTINCT grupp FROM pass_mall WHERE (till IS NULL OR till >= ?) AND (fran IS NULL OR fran <> till) ORDER BY grupp');
    $st->execute([date('Y-m-d')]);
    return $st->fetchAll(PDO::FETCH_COLUMN);
}

function skapa_tabeller(PDO $pdo): void {
    try { $pdo->query('SELECT 1 FROM pass_mall LIMIT 1'); return; } catch (PDOException $e) { /* finns inte än */ }
    $mysql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    $id = $mysql ? 'INT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $slut = $mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
    $tabeller = [
        // Ett återkommande pass har fran/till tomma eller olika. Ett enstaka extrapass har fran = till = dagen.
        "CREATE TABLE pass_mall (id $id, veckodag INT NOT NULL, tid VARCHAR(20) NOT NULL, grupp VARCHAR(100) NOT NULL, kategori VARCHAR(20) NOT NULL DEFAULT 'barn', fran VARCHAR(10), till VARCHAR(10))",
        "CREATE TABLE pass_installt (pass VARCHAR(30) PRIMARY KEY, orsak VARCHAR(200))",
        "CREATE TABLE instruktor (id $id, namn VARCHAR(100) NOT NULL, epost VARCHAR(200), kod VARCHAR(40) NOT NULL UNIQUE)",
        "CREATE TABLE bemanning (pass VARCHAR(30) NOT NULL, instruktor_id INT NOT NULL, PRIMARY KEY (pass, instruktor_id))",
        "CREATE TABLE anmalan (id $id, skapad VARCHAR(19) NOT NULL, arende VARCHAR(20) NOT NULL, vem VARCHAR(50) NOT NULL, alder VARCHAR(5), namn VARCHAR(100) NOT NULL, epost VARCHAR(200) NOT NULL, mobil VARCHAR(40), klar INT NOT NULL DEFAULT 0)",
        "CREATE TABLE paminnelse (pass VARCHAR(30) PRIMARY KEY, skickad VARCHAR(19) NOT NULL)",
    ];
    foreach ($tabeller as $sql) $pdo->exec($sql . $slut);

    if (!empty(konfig()['exempeldata'])) {
        // Klubbens träningsschema, samma som i schema.js.
        $mall = $pdo->prepare('INSERT INTO pass_mall (veckodag, tid, grupp, kategori) VALUES (?, ?, ?, ?)');
        foreach ([
            [1, '16.30–17.30', 'Barn nybörjare', 'barn'], [1, '17.30–18.30', 'Ungdomsgrupp', 'ungdom'], [1, '18.30–19.30', 'Vuxengrupp', 'vuxna'],
            [2, '16.30–17.30', 'Barn fortsättning 1', 'barn'], [2, '17.30–18.30', 'Barn fortsättning 2', 'barn'], [2, '18.30–19.30', 'Vuxna / Ungdom kumite', 'ungdom-vuxna'],
            [4, '16.30–17.30', 'Barn fortsättning 2', 'barn'], [4, '17.30–18.30', 'Ungdomsgrupp', 'ungdom'], [4, '18.30–19.30', 'Vuxengrupp', 'vuxna'],
        ] as $r) $mall->execute($r);
        $ins = $pdo->prepare('INSERT INTO instruktor (namn, epost, kod) VALUES (?, ?, ?)');
        foreach (['A', 'B', 'C'] as $x) $ins->execute(["Instruktör $x", 'instruktor-' . strtolower($x) . '@example.com', ny_kod()]);
    }
}

function ny_kod(): string { return bin2hex(random_bytes(12)); }

// ---------- pass ----------
// Ett pass heter "datum_mallid", till exempel "2027-01-18_3".
function kommande_pass(int $dagar, ?DateTimeImmutable $fran = null): array {
    $pdo = db();
    $mallar = $pdo->query('SELECT * FROM pass_mall ORDER BY tid')->fetchAll();
    $installt = [];
    foreach ($pdo->query('SELECT pass, orsak FROM pass_installt') as $r) $installt[$r['pass']] = (string)$r['orsak'];
    $ledare = [];
    foreach ($pdo->query('SELECT b.pass, i.id, i.namn FROM bemanning b JOIN instruktor i ON i.id = b.instruktor_id ORDER BY i.namn') as $r) {
        $ledare[$r['pass']][] = ['id' => (int)$r['id'], 'namn' => $r['namn']];
    }
    $ut = [];
    $dag = $fran ?? new DateTimeImmutable('today');
    for ($i = 0; $i < $dagar; $i++, $dag = $dag->modify('+1 day')) {
        $datum = $dag->format('Y-m-d');
        foreach ($mallar as $m) {
            if ((int)$m['veckodag'] !== (int)$dag->format('N')) continue;
            if ($m['fran'] && $datum < $m['fran']) continue;
            if ($m['till'] && $datum > $m['till']) continue;
            $id = $datum . '_' . $m['id'];
            $ut[] = [
                'id' => $id, 'datum' => $datum, 'tid' => $m['tid'], 'grupp' => $m['grupp'], 'kategori' => $m['kategori'],
                'extra' => $m['fran'] !== null && $m['fran'] === $m['till'],
                'installt' => isset($installt[$id]), 'orsak' => $installt[$id] ?? '', 'ledare' => $ledare[$id] ?? [],
            ];
        }
    }
    return $ut;
}

// Tar bort instruktörer, inställningar och påminnelser för pass från en mall, från ett visst datum.
function rensa_mall(int $mall, string $fran = '0000-00-00'): void {
    $pdo = db();
    foreach (['bemanning', 'pass_installt', 'paminnelse'] as $tabell) {
        $alla = $pdo->query("SELECT DISTINCT pass FROM $tabell")->fetchAll(PDO::FETCH_COLUMN);
        $st = $pdo->prepare("DELETE FROM $tabell WHERE pass = ?");
        foreach ($alla as $p) if (str_ends_with($p, '_' . $mall) && substr($p, 0, 10) >= $fran) $st->execute([$p]);
    }
}

// Tar bort en mall. Har passet redan körts avslutas det i går i stället, så att historiken finns kvar.
function ta_bort_mall(int $id): void {
    $pdo = db();
    $st = $pdo->prepare('SELECT * FROM pass_mall WHERE id = ?');
    $st->execute([$id]);
    $m = $st->fetch();
    if (!$m) return;
    $idag = date('Y-m-d');
    if ($m['fran'] !== null && $m['fran'] >= $idag) {
        rensa_mall($id);
        $pdo->prepare('DELETE FROM pass_mall WHERE id = ?')->execute([$id]);
        return;
    }
    rensa_mall($id, $idag);
    if ($m['till'] === null || $m['till'] >= $idag) {
        $pdo->prepare('UPDATE pass_mall SET till = ? WHERE id = ?')->execute([date('Y-m-d', strtotime('-1 day')), $id]);
    }
}

// Vilka pass varje instruktör har lett mellan två datum (inställda pass räknas inte).
function instruktor_historik(string $fran, string $till): array {
    $pdo = db();
    $mallar = [];
    foreach ($pdo->query('SELECT * FROM pass_mall') as $m) $mallar[(int)$m['id']] = $m;
    $installt = array_flip($pdo->query('SELECT pass FROM pass_installt')->fetchAll(PDO::FETCH_COLUMN));
    $ut = [];
    foreach ($pdo->query('SELECT id, namn FROM instruktor ORDER BY namn') as $i) $ut[(int)$i['id']] = ['id' => (int)$i['id'], 'namn' => $i['namn'], 'pass' => []];
    foreach ($pdo->query('SELECT pass, instruktor_id FROM bemanning') as $b) {
        [$datum, $mid] = array_pad(explode('_', $b['pass'], 2), 2, '');
        $m = $mallar[(int)$mid] ?? null;
        if (!$m || $datum < $fran || $datum > $till || isset($installt[$b['pass']]) || !isset($ut[(int)$b['instruktor_id']])) continue;
        $ut[(int)$b['instruktor_id']]['pass'][] = ['datum' => $datum, 'tid' => $m['tid'], 'grupp' => $m['grupp']];
    }
    foreach ($ut as &$i) {
        usort($i['pass'], fn($a, $b) => strcmp($a['datum'] . $a['tid'], $b['datum'] . $b['tid']));
        $i['antal'] = count($i['pass']);
    }
    $ut = array_values($ut);
    usort($ut, fn($a, $b) => $b['antal'] <=> $a['antal'] ?: strcmp($a['namn'], $b['namn']));
    return $ut;
}

function hitta_pass(string $id, int $dagar = 60): array {
    foreach (kommande_pass($dagar) as $p) if ($p['id'] === $id) return $p;
    svara(['fel' => 'Passet finns inte.'], 404);
}

function passtext(array $p): string {
    $d = new DateTimeImmutable($p['datum']);
    $dagar = [1 => 'mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'];
    $man = [1 => 'jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
    return $dagar[(int)$d->format('N')] . ' ' . (int)$d->format('j') . ' ' . $man[(int)$d->format('n')] . ' ' . $p['tid'] . ', ' . $p['grupp'];
}


// ---------- mejl ----------
function skicka_mejl(string $till, string $amne, string $text): bool {
    if (!filter_var($till, FILTER_VALIDATE_EMAIL)) return false;
    $m = konfig()['mejl'];
    $amne = str_replace(["\r", "\n"], ' ', $amne);
    $kod = fn(string $s) => '=?UTF-8?B?' . base64_encode($s) . '?=';
    $doman = substr((string)strrchr($m['fran'], '@'), 1);
    $meddelande = implode("\r\n", [
        'Date: ' . date('r'),
        'From: ' . $kod($m['fran_namn']) . ' <' . $m['fran'] . '>',
        'To: <' . $till . '>',
        'Subject: ' . $kod($amne),
        'Message-ID: <' . bin2hex(random_bytes(8)) . '@' . $doman . '>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
    ]) . "\r\n\r\n" . chunk_split(base64_encode($text));

    if ($m['satt'] === 'fil') {
        if (!is_dir($m['mapp'])) mkdir($m['mapp'], 0700, true);
        $namn = date('Y-m-d_His') . '_' . bin2hex(random_bytes(3)) . '.eml';
        return file_put_contents($m['mapp'] . '/' . $namn, $meddelande) !== false;
    }
    return smtp_skicka($m, $till, $meddelande);
}

// Skickar via SMTP med kryptering och inloggning, som Loopia rekommenderar.
// Port 587: vanlig anslutning som krypteras med STARTTLS (Loopias PHP-exempel). Port 465: krypterad från start.
function smtp_skicka(array $m, string $till, string $meddelande): bool {
    $direktKrypterad = (int)$m['port'] === 465;
    $s = @stream_socket_client(($direktKrypterad ? 'ssl://' : 'tcp://') . $m['host'] . ':' . $m['port'], $nr, $fel, 15);
    if (!$s) { error_log("SMTP: kunde inte ansluta: $fel"); return false; }
    stream_set_timeout($s, 15);
    $las = function () use ($s): string {
        $svar = '';
        while (($rad = fgets($s, 515)) !== false) {
            $svar .= $rad;
            if (strlen($rad) < 4 || $rad[3] === ' ') break;
        }
        return $svar;
    };
    $steg = function (?string $kommando, string $vantat) use ($s, $las): void {
        if ($kommando !== null) fwrite($s, $kommando . "\r\n");
        $svar = $las();
        if (strncmp($svar, $vantat, 3) !== 0) throw new RuntimeException(trim($svar));
    };
    try {
        $doman = substr((string)strrchr($m['fran'], '@'), 1);
        $steg(null, '220');
        $steg('EHLO ' . $doman, '250');
        if (!$direktKrypterad) {
            $steg('STARTTLS', '220');
            if (!stream_socket_enable_crypto($s, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) {
                throw new RuntimeException('kunde inte starta kryptering (STARTTLS)');
            }
            $steg('EHLO ' . $doman, '250');
        }
        $steg('AUTH LOGIN', '334');
        $steg(base64_encode($m['anv']), '334');
        $steg(base64_encode($m['losen']), '235');
        $steg('MAIL FROM:<' . $m['fran'] . '>', '250');
        $steg('RCPT TO:<' . $till . '>', '250');
        $steg('DATA', '354');
        $steg(preg_replace('/^\./m', '..', $meddelande) . "\r\n.", '250');
        fwrite($s, "QUIT\r\n");
        return true;
    } catch (RuntimeException $e) {
        error_log('SMTP: ' . $e->getMessage());
        return false;
    } finally {
        fclose($s);
    }
}
