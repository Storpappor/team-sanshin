# Team Sanshin – webbprototyp

Prototyp för karateklubbens nya sajt (tänkt adress: www.teamsanshin.se). Byggd mobilen först, eftersom de flesta besökare kommer via QR-koder på affischer.

Förhandsversion att dela: https://storpappor.github.io/team-sanshin/ (GitHub Pages från grenen `main` i https://github.com/Storpappor/team-sanshin). Varje gång något laddas upp till `main` uppdateras adressen inom någon minut.

## Filer

- `CLAUDE.md` – instruktioner till Claude Code: mål, arbetssätt och krav.
- `UPPGIFTER.md` – vad som ska göras, i ordning.
- `BESLUT.md` – det klubben behöver bestämma eller ta fram.
- `index.html` – huvudversionen (lila accentfärg). Sidans innehåll.
- `stil.css` – allt utseende. Färgerna är variablerna överst.
- `skript.js` – schemat, formuläret, spelrutan och scrolleffekterna.
- `bilder/` – bilderna som sidan använder. `barn-svartvit.jpg`, `pixel-drom.jpg` och `pixel-dojo.jpg` används inte på sidan just nu.
- `prototyp/index.html` – den ursprungliga prototypen i en enda fil (bilderna inbäddade). Behålls som facit, ändras inte.
- `alternativ/index-rod.html` – samma sida med röd accentfärg, fortfarande i en enda fil. Skillnaden ligger i färgvariablerna överst i CSS:en.

Inget byggsteg behövs, men sidan ska öppnas via en lokal webbserver (inte som fil direkt) för att bilderna och skriptet ska laddas på samma sätt som på riktigt.

## Mål med sidan

1. Få föräldrar att anmäla sig och sina barn till terminen som startar vecka 3 2027 (första pass måndag 18/1) (primärt).
2. Visa tradition och rötter: Sanshin Kan, startad 1969.
3. Spelet är en kul extragrej, inte huvudsaken.

## Sidans delar, uppifrån

1. Första vyn: rubrik, terminstart, två knappar (anmäl / provträna), bältesbilden.
2. Årtalsscen (`.s3`): 1969, 2011 och 2027 zoomar in en i taget medan avsnittet ligger fast.
3. Japansk disciplin (`.disc`): fyra meningar som tänds när de scrollas in.
4. Tre grupper (`.s2`): barn, tonåring, vuxen. Raderna tänds en i taget medan avsnittet ligger fast.
5. Schema: hela veckan på en gång, dagarna under varandra i telefonen och bredvid varandra på dator. Med servern går det att bläddra vecka för vecka (högst 12 veckor fram), och varje pass visar instruktören eller "Inställt". Utan server (GitHub Pages) visas bara veckomönstret från `schema.js`.
6. Så går det till: tre steg och pris.
7. Foton från lokalen och föräldracitat.
8. Anmälningsformulär (`#boka`).
9. Presentkort.

Fast längst ner: anmälningsknapp (döljs när första vyns knapp eller formuläret syns). Flytande i hörnet: "Spela spelet", som öppnar en ruta.

## Det som är demo eller platshållare

- **Formuläret skickar ingenting.** Det visar bara en bekräftelse. Behöver kopplas till e-post eller medlemssystem.
- **Spelet körs i rutan** i en iframe som skapas när rutan öppnas och tas bort när den stängs (spelet stannar då). Adressen är https://storpappor.github.io/tamas-mobile-preview/combined/ och ligger i `GAME_URL` i `skript.js`. Länken "Öppna spelet i en ny flik" finns kvar som reserv. Rutans höjd räknas ut från bredden plus plats för spelets styrknappar på pekskärmar; ändras spelets layout kan siffrorna i `frameHeight()` behöva justeras.
- **Schemat** är klubbens riktiga och ligger i `schema.js`, som är lätt att ändra för hand. Samma schema finns i servern (`api/lib.php` och `verktyg/provserver.py`).
- **Text inom hakparentes** är platshållare: priser, foton, föräldracitat.
- **Bilden i spelknappen** (och i spelrutan medan spelet laddar) är `bilder/spel-tamas.jpg`: spelets eget porträtt av Tamas med TAMAS-loggan, sammansatt ur spelets titelskärm. `pixel-dojo.jpg` (affischillustrationen) används inte längre på sidan.
- **Åldersfältet** tar 7–17 år; övre gränsen är en gissning.
- **Texterna** är utkast och inte slutgiltigt godkända av klubben.

## Teknik

- Ren HTML, CSS och JavaScript i en fil. Inga ramverk eller beroenden.
- Typsnitt från Google Fonts: Archivo Black (rubriker), DM Sans (brödtext), Pixelify Sans (speletiketter).
- Färger och typsnitt är CSS-variabler på `:root`. Sidan har ljust och mörkt läge.
- Scrolleffekterna: skriptet läser scrollpositionen och sätter klasser (`on`, `post`, `go`). Själva rörelserna är CSS-övergångar på `transform` och `opacity`. En tidigare version som skalade siffran direkt efter scrollpositionen hackade på iPhone.
- `prefers-reduced-motion` stänger av fastlåsning och animationer och visar allt som en vanlig sida.
- Hänsyn till iPhone-kanter med `env(safe-area-inset-*)`.

## Server: anmälningar, instruktörer och mejl (under arbete)

Byggs för ett webbhotell med PHP, tänkt Loopia. Ännu inte testat hos Loopia.

- `api/` – serverns PHP-kod. `index.php` tar emot anrop från sidorna, `paminnelse.php` körs en gång om dagen och mejlar instruktörerna om pass utan instruktör (de svarar på mejlet, och admin sätter upp dem). Inställningar i `api/config.local.php` (mall: `config.example.php`, laddas aldrig upp).
- `data/` – databasen och sparade testmejl. Laddas aldrig upp och kan inte nås från webben.
- `admin/` – kräver lösenord. Tre flikar: Anmälningar, Pass (sätta instruktörer, ställa in pass med orsak, och under "Veckoschema" lägga till, ändra och ta bort återkommande pass och enstaka extrapass) och Instruktörer (lägga till, ändra och ta bort, samt körda pass per månad över valfri period med Excel-export). Pass som tas bort avslutas i stället om de redan har körts, så att historiken finns kvar.
- `intern/` – gemensamt utseende och skript för de två sidorna ovan.
- `verktyg/provserver.py` – låtsasserver för att prova allt på egen dator utan PHP: `python verktyg/provserver.py`, öppna http://localhost:8080. Mejlen hamnar som filer i `data/mejl/`. Lösenordet till adminsidan finns i `verktyg/provserver-losen.txt`.
- `skiss/instruktorer.html` – den första klickbara skissen.

Formuläret på sajten skickar till servern, utom på GitHub Pages där det fortfarande är en demo.

## Ankare för QR-koder

`#boka` (anmälan), `#schema`, `#barn`, `#ungdom`, `#du`, `#sedan1969`, `#julklapp` (presentkort).

Länkar med `data-goal` eller `data-who` förväljer rätt alternativ i formuläret.

## Fakta som används på sidan

- Adress: Björngårdsgatan 15, 118 52 Stockholm (nära Mariatorget).
- 1969: Tamas Weber, 10 dan, startar Sanshin Kan på Olofsgatan i Stockholm.
- 2011: Ken Bokelius, 7 dan, startar Sanshin Kan Södermalm på Björngårdsgatan 15.
- 2027: nytt intag av medlemmar. Terminstart vecka 3 2027 (första pass måndag 18/1).
- Nuvarande klubbsajt på adressen: https://karateklubben.se/
