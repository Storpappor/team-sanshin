#!/bin/bash
# Lägger ut sajten hos Loopia från main på GitHub.
# Körs över SSH:  bash ~/sanshin-kod/verktyg/loopia-uppdatera.sh
#
# Koden hämtas till ~/sanshin-kod (utanför webben) och bara det som ska synas
# kopieras till ~/teamsanshin.se/public_html. Inställningar och lösenord ligger i
# ~/sanshin-privat/config.local.php och rörs aldrig av skriptet.
set -euo pipefail
KOD="$HOME/sanshin-kod"
WEBB="$HOME/teamsanshin.se/public_html"
LOGG="$HOME/sanshin-privat/uppdatering.log"

[ -d "$WEBB" ] || { echo "Webbmappen $WEBB finns inte. Koppla domänen till webbhotellet först."; exit 1; }
mkdir -p "$HOME/sanshin-privat"
chmod 700 "$HOME/sanshin-privat"

if [ ! -d "$KOD/.git" ]; then
  git clone -q --branch main https://github.com/Storpappor/team-sanshin.git "$KOD"
fi
git -C "$KOD" fetch -q origin main
git -C "$KOD" reset -q --hard origin/main

# Det som inte ska ut på webben.
rsync -a --delete \
  --exclude '.git/' --exclude '.gitignore' --exclude '.claude/' \
  --exclude 'verktyg/' --exclude 'skiss/' --exclude 'prototyp/' --exclude 'alternativ/' \
  --exclude 'data/' --exclude 'api/config.local.php' --exclude 'api/config.example.php' \
  --exclude 'README.md' --exclude 'UPPGIFTER.md' --exclude 'BESLUT.md' --exclude 'CLAUDE.md' \
  "$KOD/" "$WEBB/"

echo "$(date '+%F %T') utlagd $(git -C "$KOD" log -1 --format='%h %s')" | tee -a "$LOGG"
