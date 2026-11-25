# Flashly

Tanulókártya webapp (telepíthető PWA): **Kártyák**, **Tanulás**, **Teszt** és **Párosítás** mód, jelszóval védett csoportok, fiókok és vendég mód. Alapnyelv magyar, emellett angol, francia és német.

- Éles cím (beállítás után): `https://flashly.vercel.app`
- Biztonsági jelentés: [docs/BIZTONSAGI-JELENTES.md](docs/BIZTONSAGI-JELENTES.md)

## Technológia röviden

| Rész | Választás | Miért |
|---|---|---|
| Keretrendszer | Next.js 16 (App Router) + TypeScript + Tailwind 4 | Vercelen natív, gyors |
| Adatbázis | Neon Postgres (Vercel Marketplace, ingyenes csomag) + Drizzle ORM | egy kattintással bekötható, ingyenes |
| Profilképek | az adatbázisban (256×256 WebP, kb. 10–20 KB) | nem kell külön tárhely-szolgáltatás (Blob), és a kép csak a tulajdonosának látszik |
| Jelszavak | argon2id | ajánlott, korszerű jelszó-hash |
| Fordítás | next-intl | a nyelv sütiben és a fiókban tárolódik |
| PWA | saját, kicsi service worker | pontosan kézben tartható, mit tárol (csak nyilvános statikus fájlt) |
| Hangok | a böngésző generálja (Web Audio), felolvasás: Web Speech API | nincs hangfájl, nincs külső szolgáltatás |

Minden ingyenes: Vercel Hobby csomag + Neon ingyenes csomag.

## Környezeti változók

| Név | Mi ez | Honnan |
|---|---|---|
| `DATABASE_URL` | az adatbázis címe | **automatikus**: a Neon bekötésekor a Vercel beállítja (a `DATABASE_URL_UNPOOLED`-ot is) |
| `SESSION_SECRET` | hosszú véletlen szöveg, ezzel írja alá a szerver a vendég-sütiket | a hash-generátor oldalon: „Titok generálása” |
| `ADMIN_PASSWORD_HASH` | az admin jelszó hash-e (base64) | a hash-generátor oldalon: „Hash készítése” |
| `ADMIN_PATH_SLUG` | az admin oldal titkos útvonala | nem kötelező, alapból `jakab-admin-page-do-not-touch` (kisbetű, szám, kötőjel, min. 8 karakter) |

A `BLOB_READ_WRITE_TOKEN` **nem kell**, mert a profilképek az adatbázisban vannak.

### Az admin jelszó hash-ének elkészítése (telefonról is)
1. Nyisd meg: `https://flashly.vercel.app/jakab-admin-page-do-not-touch/hash` (ha más slugot állítottál be, akkor azzal).
2. Írd be kétszer az admin jelszót (min. 12 karakter), és nyomd meg a „Hash készítése” gombot. A hash a telefonod böngészőjében készül, a jelszó nem megy el sehova.
3. Másold ki a kapott hosszú szöveget, és illeszd be a Vercelen az `ADMIN_PASSWORD_HASH` értékének.
4. Ugyanitt a „Titok generálása” gombbal kapsz egy `SESSION_SECRET` értéket.

Számítógépen ugyanez parancssorból: `npm run hash-admin` (a jelszót rejtve kéri be).

## Telepítés a Vercelre (egyszeri beállítás)

1. **Vercel projekt**: Vercel → Add New → Project → Import Git Repository → GitHub → `kalmanjakab/lumio`. A projekt neve legyen `flashly`. A Framework automatikusan Next.js.
2. **Adatbázis**: a projektben Storage → Create Database → Neon → régió: Frankfurt (eu-central-1) → Connect, mindhárom környezethez (Production, Preview, Development).
3. **Környezeti változók**: Settings → Environment Variables → `SESSION_SECRET` és `ADMIN_PASSWORD_HASH` (és ha kell, `ADMIN_PATH_SLUG`).
4. **Redeploy**: Deployments → a legutóbbi → Redeploy. A build az adatbázis-táblákat is létrehozza.

Utána minden push a `main` ágra automatikusan települ.

## Használati leírás – admin

- Belépés: `https://flashly.vercel.app/<ADMIN_PATH_SLUG>`, az admin jelszóval. A belépés 2 óráig érvényes.
- **Csoport**: Tartalom → Új csoport (név + jelszó). A csoport oldalán átnevezheted, új jelszót adhatsz neki (a régit nem lehet visszanézni), és a „Mindenki kizárása” gombbal mindenkinek újra be kell írnia a jelszót. A jelszócsere is kizár mindenkit.
- **Készlet**: Tartalom → Új készlet címe + hová kerüljön (nyilvános vagy egy csoport). A szerkesztőben:
  - cím, leírás, csoport (áthelyezés vagy nyilvánossá tétel),
  - a szó és a jelentés nyelve (ehhez igazodik a felolvasás),
  - saját osztályzat-küszöbök, ha a globálistól eltérőt szeretnél,
  - kártyák szerkesztése, átrendezése, törlése,
  - **Tömeges import**: Excelből vagy Google Táblázatból két oszlopot kimásolva beilleszted (soronként egy kártya, a szó és a jelentés között tabulátor), legfeljebb 1000 sor egyszerre. Hozzáadhatod a végére, vagy lecserélheted a meglévőket.
  - Ne felejts el **Mentés**-t nyomni (alul).
- **Tipp a jelentésekhez**: ha egy szónak több jó fordítása van, vesszővel vagy pontosvesszővel sorold fel („feladni, abbahagyni”). Megengedő értékelésnél bármelyik elfogadott.
- **Felhasználók**: lista; elfelejtett jelszónál „Ideiglenes jelszó”. A felhasználó minden eszközről kijelentkezik, és belépéskor új jelszót kell választania. Itt tudsz felhasználót törölni is.
- **Beállítások**: globális osztályzat-küszöbök (alapból 5: 85%, 4: 70%, 3: 55%, 2: 40%, alatta 1).

## Használati leírás – felhasználó

- **Vendégként** azonnal használható: nyilvános készletek, és a csoportok jelszóval megnyithatók ezen az eszközön. A haladás a böngészőben marad.
- **Fiókkal** (felhasználónév + jelszó, e-mail nélkül) a haladás, a csillagok, a csoportok és a teszteredmények minden eszközön megmaradnak. Regisztrációkor a vendégként elért haladás átkerül a fiókba.
- **Készlet oldal**: kártya-előnézet, a négy mód, „Csak a csillagozott kártyák” kapcsoló, kártyalista felolvasással és csillaggal.
- **Kártyák**: koppintásra fordul, jobbra húzás = tudom, balra = még tanulom (vagy a pipa és X gombokkal; gépen nyilakkal és szóközzel). Visszavonás, tipp, beállítások a fogaskerékkel.
- **Tanulás**: 7 kártyás körök. Minden kártya feleletválasztós, majd írásos kérdésen megy át. A hibás kártya hamarabb visszajön. „Nem tudom”, „Mégis jó volt”, körök végén összegző.
- **Teszt**: beállítod a kérdések számát és típusát, a végén százalék, 1–5 osztályzat és kérdésenkénti javítás. A hibás kártyákat egy gombbal a Tanulásba viheted.
- **Párosítás**: 12 csempe, minél gyorsabban. A rossz pár +1 másodperc, a legjobb időd mentődik.
- **Beállítások**: profilkép (feltöltés vagy avatar), jelszócsere, csoportok kezelése, téma, hang, nyelv, tanulási alapbeállítások, telepítés, adatvédelem, fióktörlés.
- **Telepítés**: Androidon a megjelenő „Telepítés” sávval. iPhone-on: Safari → Megosztás → Főképernyőhöz adás.

## Döntések, ahol a referencia nem volt egyértelmű

- Kártyák „Tanulási módszer”: *Alap rendezés* (tudom / még tanulom) és *Lapozás* (rendezés nélkül).
- Tanulás „Írásos mód” almenü: ékezetes betűk sora a beviteli mező felett, és tipp gomb (a következő betű felfedése).
- Teszt „Válasz ezzel”: Szó / Jelentés / Mindkettő, alapból Mindkettő. A kérdések száma alapból legfeljebb 20.
- Párosítás Szó/Jelentés kapcsoló: ha csak az egyik be van kapcsolva, azzal az oldallal kell kezdeni a párosítást.
- Osztályzat-küszöbök: „85% fölött” = legalább 85%.
- Navigáció: mobilon 4 fül (Főoldal, Könyvtár, Csoportok, Beállítások), asztali gépen oldalsáv és jobb felső fiókmenü.

## Ismert korlátok

- **Szinonimák**: AI nélkül a gép csak a kártyán felsorolt alternatívákat ismeri fel szinonimaként. Minden másra ott a „Mégis jó volt” gomb.
- **Felolvasás**: a böngésző beépített hangjait használja. A minőség eszközfüggő, iPhone-on a telepített hangokon múlik.
- **Offline**: internet nélkül csak egy „Nincs internetkapcsolat” oldal jelenik meg. Szándékosan nem tárolunk tananyagot az eszközön, mert a védett csoportok tartalma nem kerülhet gyorsítótárba.

## Fejlesztőknek

```bash
npm install
cp .env.example .env.local            # helyi Postgres címe stb.
npm run migrate && npm run dev        # http://localhost:3000
npm test                              # egységtesztek
npx next build && npx playwright test # végponttól végpontig tesztek (flashly_test adatbázis kell)
npm run db:generate                   # új migráció a séma módosítása után
```
