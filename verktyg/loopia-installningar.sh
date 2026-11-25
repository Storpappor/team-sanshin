#!/bin/bash
# Skapar eller uppdaterar inställningarna hos Loopia: ~/sanshin-privat/config.local.php
# Frågar efter lösenorden. De syns inte när du skriver och skrivs aldrig ut.
# Körs över SSH:  bash ~/sanshin-kod/verktyg/loopia-installningar.sh
set -euo pipefail
PRIV="$HOME/sanshin-privat"
mkdir -p "$PRIV"; chmod 700 "$PRIV"

echo "Lösenorden syns inte när du skriver. Tryck bara Enter för att behålla ett som redan är sparat."
read -r -s -p "1/3 Lösenord för databasanvändaren sanshin@t403154: " DBLOSEN; echo
read -r -s -p "2/3 Lösenord för brevlådan info@teamsanshin.se: " MEJLLOSEN; echo
read -r -s -p "3/3 Nytt lösenord till adminsidan (minst 10 tecken): " ADMINLOSEN; echo
if [ -n "$ADMINLOSEN" ]; then
  read -r -s -p "    Skriv adminlösenordet igen: " ADMINLOSEN2; echo
  [ "$ADMINLOSEN" = "$ADMINLOSEN2" ] || { echo "Adminlösenorden var inte lika. Inget är sparat."; exit 1; }
fi

DBLOSEN="$DBLOSEN" MEJLLOSEN="$MEJLLOSEN" ADMINLOSEN="$ADMINLOSEN" PRIV="$PRIV" php -r '
$fil = getenv("PRIV") . "/config.local.php";
$k = is_file($fil) ? require $fil : [
    "db" => ["dsn" => "mysql:host=mysql679.loopia.se;dbname=teamsanshin_se;charset=utf8mb4", "anv" => "sanshin@t403154", "losen" => ""],
    "mejl" => ["satt" => "smtp", "mapp" => getenv("PRIV") . "/mejl", "host" => "mailcluster.loopia.se", "port" => 587,
        "anv" => "info@teamsanshin.se", "losen" => "", "fran" => "info@teamsanshin.se", "fran_namn" => "Team Sanshin",
        "klubben" => "info@teamsanshin.se"],
    "admin_losen_hash" => "", "cron_nyckel" => bin2hex(random_bytes(16)),
    "sajt_url" => "https://teamsanshin.se", "paminn_dagar" => 3, "exempeldata" => true,
];
if (getenv("DBLOSEN") !== "") $k["db"]["losen"] = getenv("DBLOSEN");
if (getenv("MEJLLOSEN") !== "") $k["mejl"]["losen"] = getenv("MEJLLOSEN");
$a = getenv("ADMINLOSEN");
if ($a !== "") {
    if (strlen($a) < 10) { fwrite(STDERR, "Adminlösenordet är för kort. Inget är sparat.\n"); exit(1); }
    $k["admin_losen_hash"] = password_hash($a, PASSWORD_DEFAULT);
}
file_put_contents($fil, "<?php\n// Inställningar för Team Sanshin hos Loopia. Innehåller lösenord – dela aldrig filen.\nreturn " . var_export($k, true) . ";\n");
chmod($fil, 0600);

// Kontroll: databasen och inloggningen till e-postservern.
try {
    new PDO($k["db"]["dsn"], $k["db"]["anv"], $k["db"]["losen"], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    echo "Databasen: ansluten.\n";
} catch (Throwable $e) { echo "Databasen: kunde inte ansluta (", $e->getMessage(), ").\n"; }
echo "Adminlösenord: ", ($k["admin_losen_hash"] !== "" ? "sparat" : "saknas"), ".\n";
echo "Brevlådans lösenord: ", ($k["mejl"]["losen"] !== "" ? "sparat" : "saknas"), ".\n";
'
echo "Klart. Inställningarna ligger i $PRIV/config.local.php"
