<?php
// Serverns ingång. Sidorna anropar api/index.php?do=<vad> och får svar som JSON.
declare(strict_types=1);
require __DIR__ . '/lib.php';

$do = (string)($_GET['do'] ?? '');
$metod = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$in = [];
if ($metod === 'POST') {
    // Kräver JSON. Det gör att andra sajter inte kan skicka in formulär i någons namn.
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') === false) svara(['fel' => 'Fel format.'], 415);
    $in = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($in)) svara(['fel' => 'Fel format.'], 400);
}

try {
    switch ("$metod $do") {
        // ----- öppet för alla -----
        case 'GET schema':
            // En vecka i taget: vecka=0 är denna vecka, 1 nästa och så vidare, högst 12 veckor fram.
            $n = max(0, min(12, (int)($_GET['vecka'] ?? 0)));
            $idag = new DateTimeImmutable('today');
            $mandag = $idag->modify('-' . ((int)$idag->format('N') - 1) . ' day')->modify("+$n week");
            svara([
                'vecka' => (int)$mandag->format('W'), 'fran' => $mandag->format('Y-m-d'),
                'till' => $mandag->modify('+6 day')->format('Y-m-d'), 'sista' => $n >= 12,
                'pass' => array_map(fn($p) => [
                    'datum' => $p['datum'], 'tid' => $p['tid'], 'grupp' => $p['grupp'], 'kategori' => $p['kategori'],
                    'extra' => $p['extra'], 'installt' => $p['installt'], 'orsak' => $p['orsak'],
                    'ledare' => array_column($p['ledare'], 'namn'),
                ], kommande_pass(7, $mandag)),
            ]);

        case 'POST anmalan':
            // Föräldern får svar direkt; mejlen skickas efteråt så att formuläret inte behöver vänta.
            $mejl = ta_emot_anmalan($in);
            svara_och_fortsatt(['ok' => true]);
            try {
                foreach ($mejl as [$till, $amne, $text]) skicka_mejl($till, $amne, $text);
            } catch (Throwable $e) {
                error_log('Mejl efter anmälan: ' . $e); // svaret är redan skickat
            }
            exit;

        // ----- admin, med lösenord -----
        case 'POST login':
            starta_session();
            $hash = (string)(konfig()['admin_losen_hash'] ?? '');
            if ($hash === '' || !password_verify((string)($in['losen'] ?? ''), $hash)) {
                sleep(1); // gör det långsamt att gissa
                svara(['fel' => 'Fel lösenord.'], 401);
            }
            session_regenerate_id(true);
            $_SESSION['admin'] = true;
            svara(['ok' => true]);

        case 'POST logout':
            starta_session();
            $_SESSION = [];
            session_destroy();
            svara(['ok' => true]);

        case 'GET admin':
            krav_admin();
            $pdo = db();
            $instruktorer = [];
            $antal = [];
            $pass = kommande_pass(28);
            foreach ($pass as $p) foreach ($p['ledare'] as $l) $antal[$l['id']] = ($antal[$l['id']] ?? 0) + 1;
            foreach ($pdo->query('SELECT * FROM instruktor ORDER BY namn') as $i) {
                $instruktorer[] = ['id' => (int)$i['id'], 'namn' => $i['namn'], 'epost' => $i['epost'],
                    'antal' => $antal[(int)$i['id']] ?? 0];
            }
            $anmalningar = $pdo->query('SELECT * FROM anmalan ORDER BY id DESC')->fetchAll();
            foreach ($anmalningar as &$a) { $a['id'] = (int)$a['id']; $a['klar'] = (bool)$a['klar']; }
            $mallar = $pdo->query('SELECT * FROM pass_mall ORDER BY veckodag, tid')->fetchAll();
            foreach ($mallar as &$m) { $m['id'] = (int)$m['id']; $m['veckodag'] = (int)$m['veckodag']; }
            svara(['pass' => $pass, 'mallar' => $mallar, 'instruktorer' => $instruktorer, 'anmalningar' => $anmalningar]);

        case 'POST stall_in':
            krav_admin();
            $p = hitta_pass((string)($in['pass'] ?? ''));
            $orsak = trim((string)($in['orsak'] ?? ''));
            if (mb_strlen($orsak) > 200) svara(['fel' => 'Orsaken får vara högst 200 tecken.'], 400);
            $pdo = db();
            $pdo->prepare('DELETE FROM pass_installt WHERE pass = ?')->execute([$p['id']]);
            if (!empty($in['installt'])) $pdo->prepare('INSERT INTO pass_installt (pass, orsak) VALUES (?, ?)')->execute([$p['id'], $orsak ?: null]);
            svara(['ok' => true]);

        case 'POST spara_mall':
            // Lägg till eller ändra ett återkommande pass eller ett enstaka extrapass.
            krav_admin();
            $m = las_mall($in);
            $pdo = db();
            if (!empty($in['id'])) {
                $pdo->prepare('UPDATE pass_mall SET veckodag = ?, tid = ?, grupp = ?, kategori = ?, fran = ?, till = ? WHERE id = ?')
                    ->execute([$m['veckodag'], $m['tid'], $m['grupp'], $m['kategori'], $m['fran'], $m['till'], (int)$in['id']]);
            } else {
                $pdo->prepare('INSERT INTO pass_mall (veckodag, tid, grupp, kategori, fran, till) VALUES (?, ?, ?, ?, ?, ?)')
                    ->execute([$m['veckodag'], $m['tid'], $m['grupp'], $m['kategori'], $m['fran'], $m['till']]);
            }
            svara(['ok' => true]);

        case 'POST ta_bort_mall':
            krav_admin();
            ta_bort_mall((int)($in['id'] ?? 0));
            svara(['ok' => true]);

        case 'GET statistik':
            krav_admin();
            [$fran, $till] = period();
            svara(['fran' => $fran, 'till' => $till, 'instruktorer' => instruktor_historik($fran, $till)]);

        case 'GET excel_instruktorer':
            krav_admin();
            [$fran, $till] = period();
            $hist = instruktor_historik($fran, $till);
            $manader = [];
            for ($d = new DateTimeImmutable(substr($fran, 0, 7) . '-01'); $d->format('Y-m') <= substr($till, 0, 7); $d = $d->modify('+1 month')) $manader[] = $d->format('Y-m');
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="instruktorer-' . $fran . '-till-' . $till . '.csv"');
            header('Cache-Control: no-store');
            $ut = fopen('php://output', 'w');
            fwrite($ut, "\xEF\xBB\xBF");
            fputcsv($ut, ["Pass per instruktör $fran till $till (inställda pass räknas inte)"], ';');
            fputcsv($ut, array_merge(['Instruktör', 'Totalt'], $manader), ';');
            foreach ($hist as $i) {
                $per = array_fill_keys($manader, 0);
                foreach ($i['pass'] as $p) $per[substr($p['datum'], 0, 7)]++;
                fputcsv($ut, array_merge([skydda_excel($i['namn']), $i['antal']], array_values($per)), ';');
            }
            fputcsv($ut, [], ';');
            fputcsv($ut, ['Instruktör', 'Datum', 'Tid', 'Grupp'], ';');
            foreach ($hist as $i) foreach ($i['pass'] as $p) fputcsv($ut, [skydda_excel($i['namn']), $p['datum'], $p['tid'], skydda_excel($p['grupp'])], ';');
            exit;

        case 'POST admin_bemanna':
            // Admin sätter en instruktör på ett pass, eller tar bort hen.
            krav_admin();
            $p = hitta_pass((string)($in['pass'] ?? ''));
            $id = (int)($in['instruktor'] ?? 0);
            $pdo = db();
            $st = $pdo->prepare('SELECT id FROM instruktor WHERE id = ?');
            $st->execute([$id]);
            if (!$st->fetch()) svara(['fel' => 'Instruktören finns inte.'], 404);
            if (!empty($in['kommer']) && $p['installt']) svara(['fel' => 'Passet är inställt.'], 409);
            $pdo->prepare('DELETE FROM bemanning WHERE pass = ? AND instruktor_id = ?')->execute([$p['id'], $id]);
            if (!empty($in['kommer'])) {
                $pdo->prepare('INSERT INTO bemanning (pass, instruktor_id) VALUES (?, ?)')->execute([$p['id'], $id]);
            } else {
                $pdo->prepare('DELETE FROM paminnelse WHERE pass = ?')->execute([$p['id']]);
            }
            svara(['ok' => true]);

        case 'POST ny_instruktor':
            krav_admin();
            $namn = trim((string)($in['namn'] ?? ''));
            $epost = trim((string)($in['epost'] ?? ''));
            if ($namn === '' || mb_strlen($namn) > 100) svara(['fel' => 'Skriv ett namn.'], 400);
            if ($epost !== '' && !filter_var($epost, FILTER_VALIDATE_EMAIL)) svara(['fel' => 'E-postadressen ser inte rätt ut.'], 400);
            db()->prepare('INSERT INTO instruktor (namn, epost, kod) VALUES (?, ?, ?)')->execute([$namn, $epost ?: null, ny_kod()]);
            svara(['ok' => true]);

        case 'POST andra_instruktor':
            krav_admin();
            $namn = trim((string)($in['namn'] ?? ''));
            $epost = trim((string)($in['epost'] ?? ''));
            if ($namn === '' || mb_strlen($namn) > 100) svara(['fel' => 'Skriv ett namn.'], 400);
            if ($epost !== '' && !filter_var($epost, FILTER_VALIDATE_EMAIL)) svara(['fel' => 'E-postadressen ser inte rätt ut.'], 400);
            db()->prepare('UPDATE instruktor SET namn = ?, epost = ? WHERE id = ?')->execute([$namn, $epost ?: null, (int)($in['id'] ?? 0)]);
            svara(['ok' => true]);

        case 'POST ta_bort_instruktor':
            krav_admin();
            $id = (int)($in['id'] ?? 0);
            $pdo = db();
            $pdo->prepare('DELETE FROM bemanning WHERE instruktor_id = ?')->execute([$id]);
            $pdo->prepare('DELETE FROM instruktor WHERE id = ?')->execute([$id]);
            svara(['ok' => true]);

        case 'POST anmalan_klar':
            krav_admin();
            db()->prepare('UPDATE anmalan SET klar = ? WHERE id = ?')->execute([empty($in['klar']) ? 0 : 1, (int)($in['id'] ?? 0)]);
            svara(['ok' => true]);

        case 'POST ta_bort_anmalan':
            krav_admin();
            db()->prepare('DELETE FROM anmalan WHERE id = ?')->execute([(int)($in['id'] ?? 0)]);
            svara(['ok' => true]);

        case 'GET excel':
            krav_admin();
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="anmalningar-' . date('Y-m-d') . '.csv"');
            header('Cache-Control: no-store');
            $ut = fopen('php://output', 'w');
            fwrite($ut, "\xEF\xBB\xBF"); // så att Excel förstår å, ä och ö
            fputcsv($ut, ['Datum', 'Ärende', 'Vem', 'Ålder', 'Namn', 'E-post', 'Mobil', 'Klar'], ';');
            foreach (db()->query('SELECT * FROM anmalan ORDER BY id') as $a) {
                fputcsv($ut, [$a['skapad'], ARENDEN[$a['arende']] ?? $a['arende'], vem_text($a['vem']), $a['alder'],
                    skydda_excel($a['namn']), $a['epost'], skydda_excel((string)$a['mobil']), $a['klar'] ? 'Ja' : 'Nej'], ';');
            }
            exit;

        default:
            svara(['fel' => 'Okänd begäran.'], 404);
    }
} catch (Throwable $e) {
    error_log((string)$e);
    svara(['fel' => 'Något gick fel på servern.'], 500);
}

// ---------- hjälpfunktioner ----------
function starta_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_name('sanshin_admin');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Strict',
        'secure' => (($_SERVER['HTTPS'] ?? '') !== '' && $_SERVER['HTTPS'] !== 'off')]);
    session_start();
}

function krav_admin(): void {
    starta_session();
    if (empty($_SESSION['admin'])) svara(['fel' => 'Logga in först.'], 401);
}

// Period för statistiken: ?fran=ÅÅÅÅ-MM-DD&till=ÅÅÅÅ-MM-DD. Standard är årets början till i dag.
function period(): array {
    $ok = fn($s) => is_string($s) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $s) && checkdate((int)substr($s, 5, 2), (int)substr($s, 8, 2), (int)substr($s, 0, 4));
    $fran = $_GET['fran'] ?? '';
    $till = $_GET['till'] ?? '';
    if (!$ok($fran)) $fran = date('Y') . '-01-01';
    if (!$ok($till)) $till = date('Y-m-d');
    if ($till < $fran) svara(['fel' => 'Slutdatumet måste vara efter startdatumet.'], 400);
    return [$fran, $till];
}

// Läser och kontrollerar ett pass från adminsidan.
function las_mall(array $in): array {
    $datum = fn($s) => preg_match('/^\d{4}-\d{2}-\d{2}$/', $s) && checkdate((int)substr($s, 5, 2), (int)substr($s, 8, 2), (int)substr($s, 0, 4));
    $start = (string)($in['start'] ?? '');
    $slut = (string)($in['slut'] ?? '');
    if (!preg_match('/^([01]\d|2[0-3])[.:][0-5]\d$/', $start) || !preg_match('/^([01]\d|2[0-3])[.:][0-5]\d$/', $slut)) svara(['fel' => 'Fyll i start- och sluttid.'], 400);
    $start = str_replace(':', '.', $start);
    $slut = str_replace(':', '.', $slut);
    if ($slut <= $start) svara(['fel' => 'Sluttiden måste vara efter starttiden.'], 400);
    $grupp = trim((string)($in['grupp'] ?? ''));
    if ($grupp === '' || mb_strlen($grupp) > 100) svara(['fel' => 'Skriv vilken grupp passet är för.'], 400);
    $kategori = (string)($in['kategori'] ?? '');
    if (!isset(KATEGORIER[$kategori])) svara(['fel' => 'Välj barn, ungdom eller vuxna.'], 400);

    if (!empty($in['extra'])) {
        $dag = (string)($in['datum'] ?? '');
        if (!$datum($dag)) svara(['fel' => 'Välj ett datum.'], 400);
        $veckodag = (int)(new DateTimeImmutable($dag))->format('N');
        $fran = $till = $dag;
    } else {
        $veckodag = (int)($in['veckodag'] ?? 0);
        if ($veckodag < 1 || $veckodag > 7) svara(['fel' => 'Välj veckodag.'], 400);
        $fran = (string)($in['fran'] ?? '') ?: null;
        $till = (string)($in['till'] ?? '') ?: null;
        if (($fran && !$datum($fran)) || ($till && !$datum($till))) svara(['fel' => 'Datumet ser inte rätt ut.'], 400);
        if ($fran && $till && $till <= $fran) svara(['fel' => 'Slutdatumet måste vara efter startdatumet.'], 400);
    }
    return ['veckodag' => $veckodag, 'tid' => $start . '–' . $slut, 'grupp' => $grupp, 'kategori' => $kategori, 'fran' => $fran, 'till' => $till];
}

function vem_text(string $vem): string {
    return implode(', ', array_map(fn($v) => VEM[$v] ?? $v, array_filter(explode(',', $vem))));
}

// Hindrar att Excel tolkar en cell som en formel.
function skydda_excel(string $s): string {
    return preg_match('/^[=+\-@]/', $s) ? "'" . $s : $s;
}

// Sparar anmälan och returnerar mejlen som ska skickas: [[till, ämne, text], ...].
function ta_emot_anmalan(array $in): array {
    // Skydd mot skräp: ett dolt fält som bara datorprogram fyller i, och för snabbt ifyllt formulär.
    if (trim((string)($in['webbplats'] ?? '')) !== '' || (int)($in['tid'] ?? 0) < 3000) return [];

    $arende = (string)($in['arende'] ?? '');
    $vem = array_values(array_intersect(array_keys(VEM), (array)($in['vem'] ?? [])));
    $alder = trim((string)($in['alder'] ?? ''));
    $namn = trim((string)($in['namn'] ?? ''));
    $epost = trim((string)($in['epost'] ?? ''));
    $mobil = trim((string)($in['mobil'] ?? ''));

    if (!isset(ARENDEN[$arende])) svara(['fel' => 'Välj vad ni vill göra.'], 400);
    if (!$vem) svara(['fel' => 'Välj vem som ska träna.'], 400);
    if ($namn === '' || mb_strlen($namn) > 100) svara(['fel' => 'Fyll i ditt namn.'], 400);
    if (!filter_var($epost, FILTER_VALIDATE_EMAIL) || strlen($epost) > 200) svara(['fel' => 'Fyll i en giltig e-postadress.'], 400);
    if ($mobil !== '' && !preg_match('/^[0-9 +()\-]{5,40}$/', $mobil)) svara(['fel' => 'Mobilnumret ser inte rätt ut.'], 400);
    if ($alder !== '' && (!ctype_digit($alder) || (int)$alder < 1 || (int)$alder > 99)) svara(['fel' => 'Åldern ser inte rätt ut.'], 400);
    if (!array_intersect($vem, ['barn', 'ungdom'])) $alder = '';

    db()->prepare('INSERT INTO anmalan (skapad, arende, vem, alder, namn, epost, mobil, klar) VALUES (?, ?, ?, ?, ?, ?, ?, 0)')
        ->execute([nu(), $arende, implode(',', $vem), $alder ?: null, $namn, $epost, $mobil ?: null]);

    $sammanfattning = "Ärende: " . ARENDEN[$arende] . "\n"
        . "Vem ska träna: " . vem_text(implode(',', $vem)) . "\n"
        . ($alder !== '' ? "Barnets ålder: $alder år\n" : '')
        . "Namn: $namn\nE-post: $epost\n"
        . ($mobil !== '' ? "Mobil: $mobil\n" : '');

    $k = konfig();
    return [
        [$k['mejl']['klubben'], 'Ny anmälan: ' . ARENDEN[$arende] . ' – ' . $namn,
            "En ny anmälan har kommit in via sajten.\n\n$sammanfattning\nAlla anmälningar finns på adminsidan:\n"
            . rtrim($k['sajt_url'], '/') . "/admin/\n"],
        // UTKAST: texten till föräldern ska godkännas av klubben.
        [$epost, 'Vi har fått din anmälan – Team Sanshin',
            "Hej $namn!\n\nTack för din anmälan till Team Sanshin. Vi har tagit emot den och hör av oss.\n\n"
            . "Det här skickade du:\n$sammanfattning\n"
            . "Vill du ändra något eller att vi tar bort dina uppgifter? Svara på det här mejlet.\n\n"
            . "Team Sanshin\nBjörngårdsgatan 15, 118 52 Stockholm\n"],
    ];
}

// Skickar svaret till webbläsaren direkt och låter skriptet fortsätta (till exempel med mejl) efteråt.
function svara_och_fortsatt(array $data): void {
    ignore_user_abort(true);
    set_time_limit(120);
    $kropp = json_encode($data, JSON_UNESCAPED_UNICODE);
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    if (function_exists('fastcgi_finish_request')) { // PHP-FPM
        echo $kropp;
        fastcgi_finish_request();
        return;
    }
    // Apache med mod_php: avsluta svaret med känd längd och utan komprimering, och töm bufferten.
    if (function_exists('apache_setenv')) @apache_setenv('no-gzip', '1');
    while (ob_get_level() > 0) ob_end_clean();
    header('Content-Encoding: identity');
    header('Content-Length: ' . strlen($kropp));
    header('Connection: close');
    echo $kropp;
    flush();
}
