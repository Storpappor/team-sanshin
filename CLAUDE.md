# Team Sanshin – webbplats

Du hjälper Aleks att göra klart och publicera karateklubbens nya sajt. Aleks är klubbens ansvarige och är inte utvecklare.

## Så här jobbar vi

- Skriv till Aleks på svenska, utan facktermer. Förklara vad du gjort och vad han behöver göra själv.
- Fråga innan du fattar beslut som kostar pengar, kräver ett konto eller rör personuppgifter.
- Gör en uppgift i taget ur `UPPGIFTER.md` och visa resultatet innan du går vidare.
- Hitta aldrig på fakta om klubben: tider, priser, namn, årtal, citat. Det som saknas står i `BESLUT.md`; fråga Aleks.
- Ändra inte texter eller utseende utan att fråga. Prototypen är resultatet av många avstämningar.

## Vad sajten ska göra

1. Få föräldrar att anmäla sig och sina barn till terminen som startar 18/1. Det är huvudmålet.
2. Visa tradition och rötter i Sanshin Kan, startad 1969.
3. Visa klubbens spel som en kul extragrej, inte som huvudsak.

Målgrupp: föräldrar med barn. De flesta kommer in via QR-koder på affischer, alltså i telefonen.

## Utgångsläget

- `index.html` är en fungerande prototyp i en enda fil (HTML, CSS, JavaScript, bilderna inbäddade som base64).
- `bilder/` innehåller samma bilder som vanliga filer.
- `alternativ/index-rod.html` är samma sida med röd accentfärg. Den lila i `index.html` är huvudversionen.
- `README.md` beskriver sidans delar och vad som är demo.

## Krav som inte får brytas

- Telefonen först. Testa i 390 px bredd innan du testar på dator.
- Scrolleffekterna ska vara mjuka på iPhone. Skriptet sätter bara klasser (`on`, `post`, `go`); rörelsen görs av CSS-övergångar på `transform` och `opacity`. Skala eller flytta aldrig element direkt efter scrollpositionen, det hackade på iPhone.
- `prefers-reduced-motion` ska fortsätta ge en vanlig stillastående sida.
- Anmälningsknappen längst ner ska finnas kvar, men döljas när första vyns knapp eller formuläret syns.
- Ankarna ska fortsätta fungera, de används i QR-koder: `#boka`, `#schema`, `#barn`, `#ungdom`, `#du`, `#sedan1969`, `#julklapp`.
- Håll det enkelt: statisk sajt utan ramverk, om inte en uppgift verkligen kräver något annat.
- Tre typsnitt: Archivo Black (rubriker), DM Sans (brödtext), Pixelify Sans (bara speletiketter).

## Fakta som är bekräftade

- Klubbnamn på sajten: Team Sanshin. Tänkt adress: www.teamsanshin.se
- Adress: Björngårdsgatan 15, 118 52 Stockholm, nära Mariatorget.
- 1969: Tamas Weber, 10 dan, startar Sanshin Kan på Olofsgatan i Stockholm.
- 2011: Ken Bokelius, 7 dan, startar Sanshin Kan Södermalm på Björngårdsgatan 15.
- 2027: nytt intag av medlemmar. Terminstart 18/1, begränsat antal platser.
- Barn tas emot från 7 år.
- Spelet: https://storpappor.github.io/tamas-mobile-preview/combined/
- Nuvarande klubbsajt på adressen: https://karateklubben.se/
