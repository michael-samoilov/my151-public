# Fanmade archetype ideas (browse filters, not build sections)

Brainstorm for new `ARCHETYPES` entries surfaced under the browser's **Archetypes**
filter. Unlike build-page place sections these overlap freely with everything else —
they're discovery lenses, so a Pokémon appearing in `kaijumon` AND `mountain` is fine.
Member lists are proposals (base-dex ids; regional-form ids can be added where apt).
Confidence in fit varies — items marked (?) are judgment calls to prune.

## 1. Kaijumon — city-crusher monster-movie energy
The user's seed. Bipedal (mostly) giant-monster silhouettes: Godzilla/Rodan/Ghidorah
homages and adjacent brutes.
`31 (Nidoqueen), 34 (Nidoking), 112 (Rhydon), 464 (Rhyperior), 130 (Gyarados),
142 (Aerodactyl), 160 (Feraligatr), 248 (Tyranitar), 306 (Aggron), 409 (Rampardos),
553 (Krookodile), 612 (Haxorus), 621 (Druddigon), 635 (Hydreigon), 697 (Tyrantrum),
776 (Turtonator), 784 (Kommo-o), 834 (Drednaw), 884 (Duraludon), 1018 (Archaludon),
998 (Baxcalibur)`
Optional: 445 Garchomp (?), 839 Coalossal (?), 799 Guzzlord (UB — probably leave to
its category). Note Tyranitar+Duraludon is a literal Godzilla-vs-Mechagodzilla pairing;
Baxcalibur is an explicit Godzilla homage.

## 2. Catmon — every gen has a cat
`52/53 (Meowth/Persian, + regional forms/Perrserker 863), 300/301 (Skitty),
403–405 (Shinx line), 431/432 (Glameow), 509/510 (Purrloin), 667/668 (Litleo),
677/678 (Espurr), 725–727 (Litten line), 906–908 (Sprigatito line)`
Overlaps starters — fine for a browse lens.

## 3. Dogmon — every gen has a dog
`58/59 (Growlithe, + Hisuian), 209/210 (Snubbull), 228/229 (Houndour),
235 (Smeargle — beret dog), 261/262 (Poochyena), 309/310 (Electrike),
506–508 (Lillipup line), 676 (Furfrou), 744/745 (Rockruff), 835/836 (Yamper),
926/927 (Fidough), 942/943 (Maschiff), 971/972 (Greavard)`

## 4. Bearmon
`216/217/901 (Teddiursa line incl. Ursaluna), 613/614 (Cubchoo), 674/675 (Pancham),
759/760 (Stufful), 775 (Komala)`
Optional: 143 Snorlax (?) — the eternal fan debate.

## 5. Crabmon — the carcinization club (crabs, lobsters, shrimp)
`98/99 (Krabby), 341/342 (Corphish), 557/558 (Dwebble), 692/693 (Clauncher),
739/740 (Crabrawler), 767/768 (Wimpod/Golisopod), 950 (Klawf)`

## 6. Monkeymon — primates
`56/57/979 (Mankey line incl. Annihilape), 190/424 (Aipom), 390–392 (Chimchar line),
511–516 (elemental monkeys), 554/555 (Darumaka — (?)), 765 (Oranguru),
766 (Passimian), 810–812 (Grookey line)`

## 7. Serpentmon — the snakes
`23/24 (Ekans), 95/208 (Onix/Steelix — rock snake), 206/982 (Dunsparce — tsuchinoko),
336 (Seviper), 349/350 (Feebas/Milotic — sea serpent), 495–497 (Snivy line),
843/844 (Silicobra)`
(Gyarados sits in kaijumon; double-listing is fine if desired.)

## 8. Folkloremon — non-legendary yokai / world-myth designs
`37/38 (Vulpix — kitsune), 78 (Rapidash — unicorn), 96/97 (Drowzee — baku),
124 (Jynx — yama-uba), 273–275 (Seedot line — tengu), 303 (Mawile — futakuchi-onna),
339/340 (Whiscash — namazu), 343/344 (Baltoy — dogū), 359 (Absol — kutabe/bai ze),
478 (Froslass — yuki-onna), 517/518 (Munna — baku), 561 (Sigilyph — Nazca lines),
622/623 (Golett — golem), 708/709 (Phantump — kodama), 778 (Mimikyu — tsukumogami),
780 (Drampa — long)`
Strong lore hook; every entry is a documented design inspiration.

## 9. False Dragons — the fan-classic "should've been Dragon type"
`6 (Charizard), 130 (Gyarados), 142 (Aerodactyl), 254 (Sceptile), 350 (Milotic),
357 (Tropius), 694/695 (Heliolisk), 757/758 (Salazzle)`
Small but instantly recognizable to fans.

## 10. Fungimon — mushrooms & spores
`46/47 (Paras), 285/286 (Shroomish), 590/591 (Foongus), 755/756 (Morelull),
948/949 (Toedscool)`
(Brute Bonnet belongs to paradox; leave it there.)

---

**Implementation note:** each is a plain `ARCHETYPES` entry (id, name, description,
pokemonIds, suggestedSlotRange, color) — they appear in the browser's Archetypes
sheet automatically. None should join `PLACES_ORDER`/build sections. Sizes range
7–25 lines, similar to existing theme archetypes (mimic, pikachu-clone).
