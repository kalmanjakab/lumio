# Flashly – biztonsági ellenőrzés és teszteredmények

Dátum: 2026. november 25. · Állapot: **minden teszt sikeres** (66 egységteszt, 34 végponttól végpontig tartó teszt)

A teszteket egy éles buildön (`next build` + `next start`) futtattam egy külön, minden futás előtt nullázott tesztadatbázison. A belépési sütik ellenőrzését olyan szerveren végeztem, ahol a tesztekhez használt „nem biztonságos süti” kapcsoló ki volt kapcsolva.

## Összefoglaló

| Követelmény | Eredmény |
|---|---|
| Védett készlet oldala jelszó nélkül → elutasítás, a forrásban nincs tartalom | ✅ 307 átirányítás a csoport zárt oldalára, a válaszban egy szó sincs a készletből |
| Védett tartalom API-n keresztül | ✅ üres lista vagy 403 |
| Más felhasználó haladása, teszteredménye | ✅ 404 / 403, csak a saját adat érhető el |
| Admin végpontok session nélkül | ✅ mind 401, felhasználói sessionnel is 401 |
| Csoportjelszó-csere után a régi feloldás | ✅ érvénytelen (fióknál és vendégnél is) |
| „Mindenki kizárása” | ✅ a vendég hozzáférés is megszűnik |
| Jelszavak tárolása | ✅ argon2id (19 MiB, 2 iteráció), szerveroldali ellenőrzés |
| Próbálkozás-korlát | ✅ belépés, regisztráció, csoportjelszó, admin belépés |
| CSRF | ✅ idegen vagy hiányzó Origin → 403 |
| Biztonsági fejlécek | ✅ CSP nonce-szal, frame-ancestors none, nosniff, Referrer-Policy, X-Frame-Options |
| Gyorsítótár | ✅ HTML és API: `private, no-store`; a service worker csak nyilvános statikus fájlt tárol |
| Fájlfeltöltés | ✅ típus a tartalom alapján, max. 2 MB, újrakódolás 256×256 WebP-re, EXIF törölve |

## Részletek

### 1. Védett csoport tartalma
- Minden védett adat egyetlen szerveroldali ellenőrzésen megy át (`getMaterialForViewer`, `assertMaterialAccess`). Fióknál az adatbázisban lévő feloldást és a csoport `accessVersion` értékével való egyezést nézi, vendégnél egy aláírt (HS256, jose) sütit.
- Teszt: jelszó nélkül a `/sets/<védett>` és mind a négy mód oldala 307-tel a csoport zárt oldalára visz. Sem az átirányító válaszban, sem a zárt csoport oldalán nem szerepel a készlet címe vagy egyetlen szava/jelentése sem.
- Teszt: `/api/cards/lookup` a védett kártyák azonosítóival üres listát ad. A keresés nem talál védett szót.
- Teszt: hamis aláírású vendég-süti nem ad hozzáférést.
- Semmilyen tartalmas oldal nem statikus: a build kimenetében minden ilyen útvonal „ƒ (Dynamic)”, csak a manifest és a robots.txt statikus.

### 2. Hozzáférés visszavonása
- Teszt: a felhasználó feloldja a csoportot és hozzáfér. Az admin új jelszót állít be, ugyanaz a felhasználó azonnal 307-et kap.
- Teszt: egy vendég feloldja a „Biosz” csoportot. Az admin a „Mindenki kizárása” gombot nyomja, a vendég azonnal 307-et kap.

### 3. Más felhasználó adatai
- Teszt: „A” felhasználó teszteredménye „B” felhasználónak és belépés nélkül is 404.
- Teszt: haladás, csillag, beállítás, állapot, teszteredmény, párosítás-idő, jelszócsere, fióktörlés és adatátvétel végpontja session nélkül 401.
- Teszt: haladást csak olyan kártyára lehet menteni, ami tényleg az adott készlethez tartozik, és a készlethez hozzáférés kell (különben 403).
- A profilkép csak a saját sessionnel kérhető le (`/api/me/avatar`, `Cache-Control: private, no-store`).

### 4. Admin
- Az admin útvonal az `ADMIN_PATH_SLUG` változóból jön. A belső útvonal (`/adm-internal`) közvetlenül 404.
- A titkos útvonal válasza `X-Robots-Tag: noindex, nofollow, noarchive` fejlécet és `<meta name="robots" content="noindex…">` címkét kap. A robots.txt nem említi.
- Mögötte valódi belépés van: argon2id hash az `ADMIN_PASSWORD_HASH` változóban, külön admin süti (SameSite=Strict, 2 óra), és minden `/api/admin/*` végpont szerveroldalon ellenőrzi.
- Teszt: mind a 11 admin végpont session nélkül 401, felhasználói sessionnel is 401.
- Teszt: 5 hibás admin jelszó után a helyes jelszóra is 429.
- **Javított hiba a tesztelés közben:** a futtatókörnyezet a `$` jelekkel teli hash egy részét változónévként értelmezte és kivágta, ezért az admin belépés sosem sikerült volna. A generátor ezért base64 formában adja ki a hash-t (abban nincs `$`), a szerver visszaalakítja. A nyers formát is elfogadja.

### 5. Belépés
- Teszt: rossz jelszóra és nem létező felhasználóra szó szerint ugyanaz a válasz (`invalid_credentials`). Nem létező felhasználónál is lefut egy hash-számítás, így az időzítésből sem derül ki, létezik-e a fiók.
- Teszt: 5 hibás próbálkozás után (felhasználónév + IP szerint) a helyes jelszóra is 429.
- Korlátok: belépés 5 hibás/15 perc (név+IP), 20/15 perc (név), 30/15 perc (IP); regisztráció 5/óra (IP); csoportjelszó 10/15 perc (IP+csoport); admin 5/15 perc (IP) és 30/óra összesen.

### 6. Sütik (élesben mért fejlécek)
```
__Host-flashly_session=…; Path=/; Expires=…(30 nap); Secure; HttpOnly; SameSite=lax
__Host-flashly_admin=…;   Path=/; Expires=…(2 óra);  Secure; HttpOnly; SameSite=strict
__Host-flashly_guest=<aláírt token>; Path=/; Max-Age=7776000 (90 nap); Secure; HttpOnly; SameSite=lax
```
Az adatbázisban a session-azonosítónak csak a SHA-256 hash-e van, így egy adatbázis-szivárgásból sem lehet belépni.

### 7. CSRF és bemenetek
- Minden módosító kérés ellenőrzi, hogy az `Origin` a saját oldalunk-e (és a `Sec-Fetch-Site`-ot is). Teszt: idegen Origin és hiányzó Origin esetén is 403.
- Minden bemenetet zod séma ellenőriz (hossz, formátum, típus). A JSON-kéréseknél `Content-Type: application/json` kell, a méret korlátozott.

### 8. Fejlécek
Teszt az éles buildön:
- `Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-…' 'strict-dynamic'; … frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'` (élesben nincs `unsafe-eval`; a `wasm-unsafe-eval` csak a hash-generátor oldalon van engedélyezve).
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Permissions-Policy`.
- HTML: `Cache-Control: private, no-store`. API: `private, no-store` és `default-src 'none'` CSP.

### 9. Service worker (PWA)
- Teszt böngészőben: a service worker aktiválása után a vendég feloldotta a csoportot, és megnyitotta a védett készletet és a Tanulás módot. Utána a gyorsítótárban csak `/_next/static/…`, ikon, manifest, favicon és az `/offline` oldal volt. Az eltárolt offline oldalban nincs semmilyen védett vagy személyes adat.

### 10. Fájlfeltöltés
- Teszt: szkriptet tartalmazó „PNG” → 415. 2 MB-nál nagyobb fájl → 413.
- Kézi ellenőrzés: egy EXIF-adatot tartalmazó JPEG-ből 256×256-os WebP lett, EXIF nélkül.

### 11. Függőségek
- `npm audit --omit=dev`: **0 sérülékenység** az élesben futó csomagokban.
- A fejlesztői eszközök között (drizzle-kit → esbuild) 4 közepes súlyosságú figyelmeztetés van. Ez csak a helyi fejlesztői szervert érinti, élesben nem fut.

## Tesztek futtatása

```bash
npm test            # egységtesztek (értékelés, Tanulás, Kártyák, Teszt, Párosítás, osztályzat, import, fordítások)
npx next build && npx playwright test   # végponttól végpontig tesztek (helyi Postgres kell: flashly_test)
```

## Egységtesztek (66)
- Írásos értékelés: Szigorú / Közepes / Megengedő esetek, ékezet, elírás-tűrés, alternatívák, kulcsszavak, rövid szavak
- Tanulás motor: kérdéstípus-sorrend, szintlépés, hibás kártya visszahozása, körök, folytatás korábbi szintről, mentett állapot
- Kártyák motor, Teszt-generálás és értékelés, Párosítás körök, osztályzat-küszöbök, tömeges import
- Fordítások: mind a 4 nyelvben ugyanazok a kulcsok és változók, minden üzenet értelmezhető

## Végponttól végpontig tesztek (34)
- 16 biztonsági teszt (fent részletezve)
- Regisztráció ellenőrzéssel, kijelentkezés, belépés egységes hibaüzenettel
- Csoport feloldása vendégként (rossz, majd jó jelszó), átvitel a fiókba regisztrációkor
- Kártyák (rendezés, visszavonás, összegző, folytatás), Tanulás (végigjátszás, Mégis jó volt), Teszt (minden típus 100%, megválaszolatlan figyelmeztetés), Párosítás (büntetés, rekord)
- Telepítési sáv (megjelenés, elutasítás megjegyzése, iPhone-os magyarázat), nyelvváltás, sötét mód
- Admin: csoport és készlet létrehozása, tömeges import, a felhasználó feloldja és látja
- Hash-generátor kimenete érvényes, service worker gyorsítótár, billentyűzetes kezelés, asztali fiókmenü

## Új funkciók (2026. november) – biztonsági szempontok

- **Saját készletek**: csak a tulajdonos látja és szerkesztheti. Más felhasználónak „nem létezik” (404), és az admin felületen sem jelennek meg. Saját készlet nem lehet csoportban (adatbázis-szabály), és feladatként sem osztható ki.
- **Képek**: feltöltéskor a szerver a fájl tartalmából ellenőrzi a típust, újrakódolja WebP-be (így a rejtett adatok és a metaadatok elvesznek), legfeljebb 6 MB és 800 px. A `/img/…` cím ugyanazzal a jogosultsággal szolgál ki, mint maga a készlet; védett csoport képe nem kerül gyorsítótárba (`no-store`).
- **Push értesítések**: a VAPID kulcspár a böngészőben készül (hash-generátor oldal), soha nem kerül a repóba vagy a naplókba. A push üzenet csak cím, szöveg és egy belső útvonal; a service worker csak saját oldalra navigál. Visszavont vagy sokszor hibás feliratkozást a szerver töröl.
- **Időzített futás** (`/api/cron/notify`): csak a `CRON_SECRET`-tel aláírt hívást fogadja el, időzítés-biztos összehasonlítással. Titok nélkül 401.
- **Tanári feladatok**: csak admin hozhat létre és törölhet; csak a csoport saját vagy nyilvános készlete osztható ki. A tanuló csak az érvényes hozzáféréssel rendelkező csoportjai feladatait látja; jelszócsere vagy „mindenki kizárása” után ezek is eltűnnek.
- **AI funkciók (Groq)**: alapból senkinél nincsenek bekapcsolva; csak az admin kapcsolhatja be felhasználónként (a felhasználó a saját beállításaival nem). Csak bejelentkezve, csak olyan kártyára vagy készletre, amihez a felhasználónak hozzáférése van. Felhasználónként 20 kérés / 24 óra, az összes AI funkciót együtt számolva; a keretet adatbázis-tranzakció és felhasználónkénti zár védi, így párhuzamos kérésekkel sem léphető túl. A hívásnapló csak időpontot és funkciót tárol, szöveget nem, és 60 nap után törlődik. A kártya szövegét az AI adatként kapja, nem utasításként; a választ séma szerint ellenőrizzük. A kulcs (`GROQ_API_KEY`) csak a Vercel környezeti változójában van, a kódban és a repóban nincs.
- **Offline mentés**: csak nyilvános és saját készlet menthető az eszközre (a böngésző tárolójába), védett csoporté nem. Kijelentkezéskor minden offline adat törlődik. A service worker továbbra is csak nyilvános statikus fájlokat és az (adat nélküli) offline oldalt tárolja; a mentett készleteket az oldal a böngésző saját tárolójából olvassa.
- E2E tesztek: `e2e/desktop-features.spec.ts` (saját készlet láthatósága, feladat jogosultság, cron titok, push és AI kikapcsolt állapot, valódi offline mód).
