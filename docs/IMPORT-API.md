# Flashly import API (AI-agenteknek)

Ezzel a végponttal egy külső program (például Claude Code vagy egy Claude Skill) emberi beavatkozás nélkül hozhat létre kártyakészletet. A készlet azonnal megjelenik az appban: csoport nélkül a nyilvános Könyvtárban, `groupId` megadásával pedig abban a csoportban.

## Beállítás (egyszer)

1. Nyisd meg a hash-generátor oldalt: `https://flashly.vercel.app/<ADMIN_PATH_SLUG>/hash`. Ott nyomd meg az **API-kulcs generálása** gombot. A kulcs a böngésződben készül.
2. Vercel → Settings → Environment Variables → **Add**:
   - Key: `IMPORT_API_KEY`
   - Value: a generált kulcs
   - Környezet: Production (és ha kell, Preview)
   - Kapcsold be a „Sensitive” jelölést.
3. Indíts egy Redeploy-t.
4. Ugyanezt a kulcsot add meg az agent beállításaiban is, környezeti változóként (például `FLASHLY_API_KEY`). Promptba vagy kódba ne írd bele.

Ha az `IMPORT_API_KEY` nincs beállítva (vagy 32 karakternél rövidebb), a végpont `503 api_disabled` választ ad. Kulcscserénél vesszővel elválasztva két kulcs is megadható (`regi,uj`). Amikor az agent már az újat használja, a régit töröld.

## Kérés

```
POST https://flashly.vercel.app/api/v1/sets
Authorization: Bearer <IMPORT_API_KEY>
Content-Type: application/json
Idempotency-Key: <egyedi azonosító>   (nem kötelező, de ajánlott)
```

### A JSON törzs

| Mező | Kötelező | Leírás |
|---|---|---|
| `title` | igen | A készlet címe, 1–120 karakter |
| `description` | nem | Leírás, legfeljebb 500 karakter |
| `cards` | igen | 1–1000 kártya |
| `cards[].front` | igen | A kártya eleje (kérdés vagy szó), legfeljebb 1000 karakter. Helyette `term` is írható. |
| `cards[].back` | igen | A kártya hátulja (válasz vagy jelentés), legfeljebb 2000 karakter. Helyette `definition` is írható. |
| `groupId` | nem | Egy meglévő csoport azonosítója. Ha nincs megadva vagy `null`, a készlet nyilvános lesz. |
| `termLang` | nem | Az eleje nyelve a felolvasáshoz, például `en-GB` (alapértelmezés: `en-GB`) |
| `definitionLang` | nem | A hátulja nyelve, például `hu-HU` (alapértelmezés: `hu-HU`) |

Ismeretlen mező nem lehet benne, mert az elgépelést is hibának vesszük. A törzs legfeljebb 1 MB lehet.

Ha egy válasznak több jó megfogalmazása is van, vesszővel vagy pontosvesszővel sorold fel („feladni, abbahagyni”). Az app a Tanulás és a Teszt módban mindegyiket elfogadja.

### Példa (curl)

```bash
curl -sS -X POST https://flashly.vercel.app/api/v1/sets \
  -H "Authorization: Bearer $FLASHLY_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: english-unit5-2026-11-25" \
  -d '{
    "title": "English Vocabulary – Unit 5",
    "description": "Advanced English vocabulary",
    "termLang": "en-GB",
    "definitionLang": "en-GB",
    "cards": [
      { "front": "What does reluctant mean?", "back": "Unwilling or hesitant." },
      { "front": "What does substantial mean?", "back": "Large in amount, value or importance." }
    ]
  }'
```

### Példa (Node.js / TypeScript)

```ts
const res = await fetch("https://flashly.vercel.app/api/v1/sets", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.FLASHLY_API_KEY}`,
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  },
  body: JSON.stringify({ title, description, cards }),
});
const data = await res.json();
if (!data.ok) throw new Error(`${data.error}: ${data.message}`);
```

## Válasz

Siker (`201 Created`):

```json
{
  "ok": true,
  "setId": "7c0e5b9e-6a2f-4c1e-9d0b-2f4f1d3e8a10",
  "cardCount": 2,
  "url": "/sets/7c0e5b9e-6a2f-4c1e-9d0b-2f4f1d3e8a10",
  "duplicate": false
}
```

Ha ugyanazzal az `Idempotency-Key`-jel és ugyanazzal a tartalommal újraküldöd (például egy hálózati hiba után), nem jön létre új készlet. Ilyenkor `200 OK` a válasz, az eredeti `setId`-vel és `"duplicate": true` értékkel. Így az újrapróbálkozás mindig biztonságos.

Hiba esetén mindig ez a forma jön:

```json
{ "ok": false, "error": "validation_failed", "message": "…", "issues": [{ "path": "cards.0.back", "code": "custom", "message": "required" }] }
```

| HTTP | `error` | Mit jelent |
|---|---|---|
| 400 | `invalid_json` | A törzs nem érvényes JSON |
| 400 | `validation_failed` | Hiányzó vagy rossz mező. Az `issues` megmondja, melyik. |
| 400 | `invalid_idempotency_key` | Az `Idempotency-Key` 8–200 látható ASCII karakter lehet (szóköz nélkül) |
| 400 | `group_not_found` | Nincs ilyen `groupId` |
| 401 | `unauthorized` | Hiányzó vagy hibás kulcs |
| 405 | `method_not_allowed` | Csak POST kérés megengedett |
| 409 | `duplicate` | Az elmúlt 24 órában már feltöltöttek pontosan ilyen készletet (ugyanaz a cím, a csoport és a kártyák). A `setId` a meglévő készletet adja meg. |
| 409 | `idempotency_key_reused` | A kulcshoz tartozó készletet azóta törölték. Küldd új kulccsal. |
| 413 | `payload_too_large` | A törzs nagyobb 1 MB-nál |
| 415 | `unsupported_media_type` | A `Content-Type` nem `application/json` |
| 422 | `idempotency_conflict` | Ugyanaz az `Idempotency-Key`, de más tartalom |
| 429 | `too_many_requests` | Túl sok kérés. A `Retry-After` fejléc megmondja, hány másodperc múlva próbálkozhatsz újra. |
| 500 | `server_error` | Váratlan hiba. Ilyenkor nem jött létre semmi. |
| 503 | `api_disabled` | A szerveren nincs beállítva az `IMPORT_API_KEY` |

## Biztonság és korlátok

- A kulcsot a szerver csak a Vercel környezeti változóból olvassa. Állandó idejű összehasonlítással ellenőrzi, így a válaszidőből nem lehet következtetni rá, és sehova nem naplózza.
- Egy IP-címről 15 percen belül 10 hibás kulcs után a végpont átmenetileg letilt (`429`).
- Sikeres feltöltésből óránként legfeljebb 60 fér bele.
- A készlet és az összes kártyája egyetlen adatbázis-tranzakcióban jön létre. Ha bármi elromlik, semmi nem marad utána, félkész készlet sem.
- Az `api_imports` táblába a kérés tartalmából csak ujjlenyomat (hash) kerül. Ez kell a duplikátumok kiszűréséhez.
- A létrehozott készlet utána az admin felületen ugyanúgy szerkeszthető vagy törölhető, mint bármelyik másik.

## Claude skill (a legegyszerűbb út)

A `skills/flashly-import` mappában kész skill van, amivel a Claude (claude.ai vagy a Claude app) magától megírja és feltölti a kártyákat.

1. Nyisd meg a hash-generátor oldalt, és a **4. Claude skill letöltése** résznél másold be az `IMPORT_API_KEY` értékét. A böngésző letölti a `flashly-import.zip` fájlt; a kulcs a ZIP-en belüli `config.json`-ba kerül, a szerverre nem megy el.
2. Claude app → Beállítások → Képességek (Capabilities): a kódfuttatás legyen bekapcsolva, és a hálózati hozzáférésnél engedélyezd a `flashly.vercel.app` domaint.
3. Ugyanitt a Skillek résznél töltsd fel a ZIP-et.
4. Írd a Claude-nak például: „Csinálj 30 angol B2 szókártyát az utazás témában, és töltsd fel a Flashlyba.”

A skill a `scripts/upload.py` szkripttel tölt fel (csak a Python standard könyvtárát használja), a kulcsot nem írja ki. Claude Code-ban a `FLASHLY_API_KEY` környezeti változóból is olvassa a kulcsot.
