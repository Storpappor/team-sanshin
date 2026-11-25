<?php
// Inställningar för servern. Kopiera den här filen till config.local.php och fyll i.
// config.local.php innehåller lösenord och laddas aldrig upp till GitHub.
// Hos Loopia ligger den utanför webbmappen: ~/sanshin-privat/config.local.php
// (servern letar där först, sedan i api/).
return [
    // Databasen.
    // På egen dator: en fil (SQLite).
    // Hos Loopia: uppgifterna från Loopias kundzon under "Databaser", till exempel
    //   'dsn' => 'mysql:host=mysqlXX.loopia.se;dbname=teamsanshin_se;charset=utf8mb4',
    'db' => [
        'dsn'   => 'sqlite:' . __DIR__ . '/../data/sanshin.sqlite',
        'anv'   => null,
        'losen' => null,
    ],

    // Mejl.
    // 'fil'  = mejlen sparas som filer i 'mapp' och skickas inte (för test).
    // 'smtp' = mejlen skickas via Loopias e-postserver från klubbens brevlåda.
    'mejl' => [
        'satt'      => 'fil',
        'mapp'      => __DIR__ . '/../data/mejl',
        'host'      => 'mailcluster.loopia.se',
        'port'      => 587, // som i Loopias PHP-exempel (STARTTLS). 465 fungerar också.
        'anv'       => 'info@teamsanshin.se',
        'losen'     => '',
        'fran'      => 'info@teamsanshin.se',
        'fran_namn' => 'Team Sanshin',
        'klubben'   => 'info@teamsanshin.se', // hit går nya anmälningar
    ],

    // Lösenordet till adminsidan, som en "hash". Skapa med:
    //   php -r "echo password_hash('ditt lösenord', PASSWORD_DEFAULT);"
    'admin_losen_hash' => '',

    // Hemlig nyckel för den dagliga påminnelsen när den körs via en adress.
    'cron_nyckel' => '',

    // Sajtens adress, används i länkar i mejlen.
    'sajt_url' => 'https://www.teamsanshin.se',

    // Hur många dagar i förväg instruktörerna påminns om pass utan instruktör.
    'paminn_dagar' => 3,

    // Lägg in exempelschema och exempelinstruktörer när databasen skapas första gången.
    'exempeldata' => true,
];
