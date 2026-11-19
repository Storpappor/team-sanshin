<?php
// Daglig påminnelse: mejlar instruktörerna om pass de närmaste dagarna som saknar instruktör.
// Körs en gång om dagen, antingen av Loopias schemaläggning (cron):
//   php /sökväg/till/api/paminnelse.php
// eller via adressen: https://www.teamsanshin.se/api/paminnelse.php?nyckel=<cron_nyckel>
declare(strict_types=1);
require __DIR__ . '/lib.php';

if (PHP_SAPI !== 'cli') {
    $nyckel = (string)(konfig()['cron_nyckel'] ?? '');
    if ($nyckel === '' || !hash_equals($nyckel, (string)($_GET['nyckel'] ?? ''))) svara(['fel' => 'Ingen åtkomst.'], 403);
}

$pdo = db();
$redan = array_flip($pdo->query('SELECT pass FROM paminnelse')->fetchAll(PDO::FETCH_COLUMN));
$tomma = array_values(array_filter(kommande_pass((int)konfig()['paminn_dagar'] + 1),
    fn($p) => !$p['installt'] && !$p['ledare'] && !isset($redan[$p['id']])));

$skickade = 0;
if ($tomma) {
    $lista = implode("\n", array_map(fn($p) => '- ' . passtext($p), $tomma));
    foreach ($pdo->query('SELECT * FROM instruktor WHERE epost IS NOT NULL') as $i) {
        $text = "Hej {$i['namn']}!\n\nDe här passen saknar fortfarande instruktör:\n\n$lista\n\n"
            . "Kan du ta något av dem? Svara på det här mejlet så sätter vi upp dig.\n\nTack!\nTeam Sanshin\n";
        if (skicka_mejl($i['epost'], 'Pass som saknar instruktör', $text)) $skickade++;
    }
    $st = $pdo->prepare('INSERT INTO paminnelse (pass, skickad) VALUES (?, ?)');
    foreach ($tomma as $p) $st->execute([$p['id'], nu()]);
}

$svar = ['pass_utan_instruktor' => count($tomma), 'mejl_skickade' => $skickade];
if (PHP_SAPI === 'cli') { echo json_encode($svar, JSON_UNESCAPED_UNICODE), "\n"; exit; }
svara($svar);
