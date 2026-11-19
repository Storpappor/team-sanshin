/* Träningsschemat som visas på sajten.
   Ändra här när schemat ändras. Varje pass: [tid, grupp, färg, etikett].
   Färg: 'barn' (gul), 'ungdom' (lila) eller 'vuxna' (svart). */
var SCHEMA = [
  {d: 'Måndag', s: [
    ['16.30–17.30', 'Barn nybörjare', 'barn', 'Barn'],
    ['17.30–18.30', 'Ungdomsgrupp', 'ungdom', 'Ungdom'],
    ['18.30–19.30', 'Vuxengrupp', 'vuxna', 'Vuxna']
  ]},
  {d: 'Tisdag', s: [
    ['16.30–17.30', 'Barn fortsättning 1', 'barn', 'Barn'],
    ['17.30–18.30', 'Barn fortsättning 2', 'barn', 'Barn'],
    ['18.30–19.30', 'Vuxna / Ungdom kumite', 'vuxna', 'Vuxna och ungdom']
  ]},
  {d: 'Torsdag', s: [
    ['16.30–17.30', 'Barn fortsättning 2', 'barn', 'Barn'],
    ['17.30–18.30', 'Ungdomsgrupp', 'ungdom', 'Ungdom'],
    ['18.30–19.30', 'Vuxengrupp', 'vuxna', 'Vuxna']
  ]}
];
