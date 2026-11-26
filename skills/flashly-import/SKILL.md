---
name: flashly-import
description: Create flashcard sets and upload them straight to the user's Flashly app (flashly.vercel.app) through its import API. Use whenever the user asks to make flashcards, szókártyák, tanulókártyák, kártyakészlet, vocabulary cards or a quiz deck from a topic, text, document, photo or word list, and/or to upload or send them to Flashly ("töltsd fel a Flashlyba", "csinálj kártyákat belőle").
---

# Flashly kártyakészlet készítése és feltöltése

A feladat: a felhasználó kérése alapján jó minőségű tanulókártyákat készíteni, és a mellékelt
`scripts/upload.py` szkripttel feltölteni őket a Flashly appba. A készlet azonnal megjelenik az appban.

## Biztonsági szabályok (kötelező)

- Az API-kulcs a skill `config.json` fájljában van (vagy a `FLASHLY_API_KEY` környezeti változóban).
  **Soha ne nyisd meg, ne olvasd ki, ne írd ki és ne idézd a `config.json` tartalmát**, és ne írd bele
  a kulcsot semmilyen parancsba. A feltöltéshez csak az `upload.py`-t futtasd: az magától beolvassa.
- Ne használj `curl`-t vagy saját kódot a feltöltéshez, mert akkor a kulcs bekerülne a beszélgetésbe.

## Lépések

1. **Tartalom összegyűjtése.** Dolgozz abból, amit a felhasználó adott (téma, szöveg, fájl, kép, szólista).
   Ha a téma túl tág, és nem derül ki a szint vagy a mennyiség, válassz észszerű alapértelmezést
   (kb. 20–40 kártya) ahelyett, hogy hosszan kérdezgetnél.
2. **Kártyák megírása** (lásd a minőségi szabályokat lent).
3. **JSON fájl írása**, például `/tmp/flashly-set.json` (a formátum lent).
4. **Ellenőrzés feltöltés nélkül:**
   `python3 <skill-mappa>/scripts/upload.py /tmp/flashly-set.json --dry-run`
5. **Feltöltés:**
   `python3 <skill-mappa>/scripts/upload.py /tmp/flashly-set.json`
   Ha a felhasználó kifejezetten feltöltést kért, nem kell külön engedélyt kérni. Ha csak kártyákat kért,
   mutass egy rövid előnézetet (cím, kártyaszám, 3–5 példa), és kérdezd meg, feltöltsd-e.
6. **Eredmény.** A szkript JSON-t ír ki. Sikernél add meg a felhasználónak a készlet linkjét (`link`)
   és a kártyák számát. Hibánál magyarázd el egyszerűen a `message` alapján, mi a gond és mit tehet.

## A JSON formátum

```json
{
  "title": "English Vocabulary – Unit 5",
  "description": "B2 szintű angol szavak",
  "termLang": "en-GB",
  "definitionLang": "hu-HU",
  "cards": [
    { "front": "reluctant", "back": "vonakodó, kelletlen" },
    { "front": "substantial", "back": "jelentős, tetemes" }
  ]
}
```

| Mező | Kötelező | Szabály |
|---|---|---|
| `title` | igen | 1–120 karakter, beszédes cím |
| `description` | nem | legfeljebb 500 karakter |
| `cards[].front` | igen | a kártya eleje (szó, kérdés), legfeljebb 1000 karakter |
| `cards[].back` | igen | a kártya hátulja (jelentés, válasz), legfeljebb 2000 karakter |
| `termLang` | nem | az eleje nyelve felolvasáshoz, pl. `en-GB`, `de-DE`, `hu-HU` (alap: `en-GB`) |
| `definitionLang` | nem | a hátulja nyelve (alap: `hu-HU`) |
| `groupId` | nem | csak akkor add meg, ha a felhasználó kifejezetten megad egy csoportazonosítót; enélkül a készlet nyilvános |

Más mező nem lehet benne. Egy készletben legfeljebb 1000 kártya fér el; ha több kell, a szkript
`--split` kapcsolóval automatikusan több részre bontja („Cím (1/2)”, „Cím (2/2)”).

## Minőségi szabályok a kártyákhoz

- Egy kártya = egy tény vagy egy szó. Az eleje legyen rövid és egyértelmű.
- A hátulja tömör: szónál a jelentés(ek), kérdésnél a lényegi válasz, nem bekezdés.
- Ha egy válasznak több jó megfogalmazása van, vesszővel vagy pontosvesszővel sorold fel
  („feladni, abbahagyni”). Az app Tanulás és Teszt módban mindegyiket elfogadja, ezért ide ne írj
  magyarázó mellékmondatot vesszővel – a magyarázat zárójelbe kerüljön.
- Szókártyánál az idegen szó legyen az elején, a magyar jelentés a hátulján, és a `termLang` /
  `definitionLang` ehhez igazodjon. Ha a felhasználó másképp kéri, kövesd azt.
- Ne legyen két azonos elejű kártya, és ne legyen üres mező.
- Tényszerű tartalomnál csak olyat írj, amiben biztos vagy.

## Hibák kezelése

- `network_error` / a szerver nem érhető el: a Claude kódfuttató környezete valószínűleg nem engedi
  a `flashly.vercel.app` elérését. Mondd meg a felhasználónak: Beállítások → Képességek (Capabilities)
  → Kódfuttatás → hálózati hozzáférés, ott vegye fel a `flashly.vercel.app` domaint az engedélyezettek közé.
  Addig a JSON fájlt elküldheted neki.
- `missing_key`: a skill nincs beállítva. A felhasználónak az admin oldal hash-generátorán újra kell
  töltenie a skillt az API-kulccsal.
- `unauthorized`: a kulcs nem egyezik a Vercelen beállítottal.
- `duplicate`: ugyanez a készlet az elmúlt 24 órában már fel lett töltve; a meglévő linkjét add meg.
- `too_many_requests`: várni kell (a `retryAfterSeconds` megmondja, mennyit).
- `validation_failed`: javítsd a JSON-t az `issues` alapján, és próbáld újra.
