# Flashly

Tanulókártya webapp (telepíthető PWA): **Kártyák**, **Tanulás**, **Teszt**, **Párosítás**, **Ismétlés** (FSRS) és **Diktálás** mód, napi cél és sorozat, értesítések, saját készletek, képek a kártyákon, tanári feladatok, offline gyakorlás, jelszóval védett csoportok, fiókok és vendég mód. Alapnyelv magyar, emellett angol, francia és német.

- Éles cím (beállítás után): `https://flashly.vercel.app`
- Biztonsági jelentés: [docs/BIZTONSAGI-JELENTES.md](docs/BIZTONSAGI-JELENTES.md)
- Import API AI-agenteknek: [docs/IMPORT-API.md](docs/IMPORT-API.md)

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
| `IMPORT_API_KEY` | az import API kulcsa (AI-agentek ezzel töltenek fel készletet) | nem kötelező; a hash-generátor oldalon: „API-kulcs generálása”. Ha nincs beállítva, az API ki van kapcsolva. |
| `VAPID_PUBLIC_KEY` | a push értesítések nyilvános kulcsa | nem kötelező; a hash-generátor oldalon: „Kulcsok generálása”. Nélküle csak az appon belüli értesítések (harang) működnek. |
| `VAPID_PRIVATE_KEY` | a push értesítések titkos kulcsa (a fenti párja) | ugyanott, ugyanazzal a gombbal. Titkos. |
| `VAPID_SUBJECT` | kapcsolattartó cím a push szolgáltatóknak | nem kötelező; pl. `https://flashly.vercel.app` vagy `mailto:valaki@pelda.hu` |
| `CRON_SECRET` | az óránkénti időzített futás (emlékeztetők) védelme | a hash-generátor oldalon a „Kulcsok generálása” adja. A Vercel automatikusan elküldi a cron hívásokkal. Nélküle nem mennek ki időzített emlékeztetők. |
| `GROQ_API_KEY` | az AI funkciók kulcsa (Groq) | nem kötelező; a console.groq.com oldalon készíted. Nélküle az AI senkinél nem működik. Az AI-t ezen felül felhasználónként az admin kapcsolja be (Admin → Felhasználók → „AI” kapcsoló). Korlát: felhasználónként 20 kérés / 24 óra. |
| `GROQ_MODEL` | melyik Groq modell válaszoljon | nem kötelező; alapból `openai/gpt-oss-120b`, ha az nem elérhető, `llama-3.3-70b-versatile`. |

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

### Push értesítések bekapcsolása

1. Nyisd meg a hash-generátor oldalt, és nyomd meg a „Kulcsok generálása” gombot (4. pont). A kulcsok a böngésződben készülnek, nem mennek el sehova.
2. A Vercelen add hozzá: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET` (és ha akarod, `VAPID_SUBJECT`), majd indíts új deploymentet.
3. A `vercel.json` 24 cron feladatot tartalmaz (minden órában egyet), mindegyik az `/api/cron/notify` címet hívja. Hobby csomagon ez megengedett, mert mindegyik naponta egyszer fut. A Vercel Cron oldalán ellenőrizheted, hogy lefutnak-e.
4. A kulcspárt ne cseréld feleslegesen: új kulcspár után mindenkinek újra be kell kapcsolnia az értesítéseket.

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
- **Feladatok**: a csoport oldalán kioszthatsz egy készletet (a csoportét vagy egy nyilvánosat) határidővel és megjegyzéssel. A tagok értesítést kapnak, a határidő előtti napon emlékeztetőt. Feladatonként látod, melyik tanuló hány százalékát tudja a kártyáknak, mennyit tanult, mi a legjobb teszteredménye, és mikor tanult utoljára.
- **Képek**: a szerkesztőben minden kártyához tölthetsz fel képet (a jelentés oldalán jelenik meg). A képet a szerver kicsinyíti és WebP formátumba alakítja.
- **Beállítások**: globális osztályzat-küszöbök (alapból 5: 85%, 4: 70%, 3: 55%, 2: 40%, alatta 1).

## Használati leírás – felhasználó

- **Vendégként** azonnal használható: nyilvános készletek, és a csoportok jelszóval megnyithatók ezen az eszközön. A haladás a böngészőben marad.
- **Fiókkal** (felhasználónév + jelszó, e-mail nélkül) a haladás, a csillagok, a csoportok és a teszteredmények minden eszközön megmaradnak. Regisztrációkor a vendégként elért haladás átkerül a fiókba.
- **Készlet oldal**: kártya-előnézet, a négy mód, „Csak a csillagozott kártyák” kapcsoló, kártyalista felolvasással és csillaggal.
- **Kártyák**: koppintásra fordul. Jobbra húzás: tudom, balra húzás: még tanulom. Átlósan húzva is működik, ujjal és egérrel is; kevés húzásnál a kártya visszaugrik. A pipa és az X gomb is használható, gépen a nyilak és a szóköz is. Visszavonás, tipp, beállítások a fogaskerékkel.
- **Tanulás**: 7 kártyás körök. Minden kártya feleletválasztós, majd írásos kérdésen megy át. A hibás kártya hamarabb visszajön. „Nem tudom”, „Mégis jó volt”, körök végén összegző.
- **Teszt**: beállítod a kérdések számát és típusát, a végén százalék, 1–5 osztályzat és kérdésenkénti javítás. A hibás kártyákat egy gombbal a Tanulásba viheted.
- **Párosítás**: 12 csempe, minél gyorsabban. A rossz pár +1 másodperc, a legjobb időd mentődik.
- **Ismétlés**: időzített ismétlés (FSRS algoritmus: a gép kiszámolja, mikor érdemes újra elővenni egy kártyát, hogy ne felejtsd el). A kártya megfordítása után 4 gombbal értékelsz (Újra, Nehéz, Jó, Könnyű); gépen szóköz és 1–4. A főoldalon és az Ismétlés oldalon minden készlet esedékes kártyája egy helyen.
- **Diktálás**: a gép felolvassa a szót, te leírod (helyesírás), vagy a jelentését írod le (hallás utáni megértés). Lassított lejátszás, a hibásak a végén újra jönnek.
- **Napi cél és sorozat**: a napi cél megválaszolt kártyák száma (alapból 20). Minden nap, amikor teljesíted, nő a sorozat. Minden 7. nap után kapsz egy sorozatmentőt (legfeljebb 2), ez egy kihagyott napot fedez. A Statisztika oldalon naptár, heti összesítő és a kártyáid szintje (új, tanulás alatt, ismert, elsajátított) látszik.
- **Értesítések**: a harang ikonnál az appon belül, és ha bekapcsolod (Beállítások → Értesítések), push üzenetként is: esti sorozat-figyelmeztetés, napi emlékeztető a választott órában, ritka visszahívó üzenet 3, 7, 14 és 30 nap kihagyás után, vasárnapi heti összefoglaló, új feladat és határidő. Este 10 és reggel 8 között nem megy ki semmi, és naponta legfeljebb 2 emlékeztető. iPhone-on előbb a kezdőképernyőre kell tenni az appot.
- **Saját készletek**: fiókkal a Könyvtár „Sajátjaim” fülén készíthetsz saját készletet, vagy bármelyik látható készletet lemásolhatod magadnak. A saját készletet csak te látod.
- **Offline**: nyilvános vagy saját készlet oldalán az „Offline mentés” gombbal elmented. Internet nélkül az app egy offline oldalt mutat, ahol a mentett készleteket kártyázhatod. Amit offline tanulsz, az a mai célba beszámít, amikor újra van net. Kijelentkezéskor az offline mentések törlődnek az eszközről.
- **AI funkciók** (csak akinek az admin bekapcsolta, és ha a `GROQ_API_KEY` be van állítva):
  - hibás válasz után a „Magyarázd el” gomb rövid magyarázatot ad, és megmondja, a beírt válaszod elfogadható volt-e;
  - „Memóriatrükk” bármelyik kártyához (a készlet oldalán a villanykörte ikon, és hibás válasz után);
  - „AI tanulási tippek” a készlet oldalán: a legtöbbször elrontott kártyáid alapján ad tanácsot.
  - Bekapcsoláskor a felhasználó értesítést kap, és a következő belépéskor egy bemutató ablakot. Az admin a Felhasználók oldalon látja, ki hány AI hívást küldött az elmúlt 7 napban és 24 órában.
- **Beállítások**: profilkép (feltöltés vagy avatar), jelszócsere, csoportok kezelése, téma, hang, nyelv, tanulási alapbeállítások, telepítés, adatvédelem, fióktörlés.
- **Telepítés**: Androidon a megjelenő „Telepítés” sávval. iPhone-on: Safari → Megosztás → Főképernyőhöz adás.

## Döntések, ahol a referencia nem volt egyértelmű

- Kártyák „Tanulási módszer”: *Alap rendezés* (tudom / még tanulom) és *Lapozás* (rendezés nélkül).
- Tanulás „Írásos mód” almenü: ékezetes betűk sora a beviteli mező felett, és tipp gomb (a következő betű felfedése).
- Teszt „Válasz ezzel”: Szó / Jelentés / Mindkettő, alapból Mindkettő. A kérdések száma alapból legfeljebb 20.
- Párosítás Szó/Jelentés kapcsoló: ha csak az egyik be van kapcsolva, azzal az oldallal kell kezdeni a párosítást.
- Osztályzat-küszöbök: „85% fölött” = legalább 85%.
- Navigáció: mobilon 4 fül (Főoldal, Könyvtár, Csoportok, Beállítások), asztali gépen oldalsáv és jobb felső fiókmenü.

## Import API (AI-agenteknek)

`POST /api/v1/sets`, Bearer kulccsal: egy külső agent (például egy Claude Skill) JSON-ban küld egy készletet, és az azonnal megjelenik az appban. A részletek és a példák: [docs/IMPORT-API.md](docs/IMPORT-API.md).

## Frissítés és verzió

- Minden deploymentnek saját build-azonosítója van (commit + build ideje). Ebből lesz a service worker verziója és a Beállítások alján látható verziószám is.
- A telepített app (és a böngészős lap is) 10 percenként, valamint minden előtérbe kerüléskor megnézi, van-e új verzió. Ha van, az új service worker magától települ és átveszi az irányítást, az app pedig újratölt. Ehhez nem kell gombot nyomni.
- Az újratöltés úgy történik, hogy ne vesszen el adat. Tanulás közben, gépelés közben, mentetlen admin-szerkesztés, illetve teszt vagy párosítás közben az app nem tölt újra a felhasználó szeme láttára. Ilyenkor oldalváltáskor vagy háttérbe kerüléskor frissül (a teszt, a párosítás és a mentetlen szerkesztés csak kilépéskor).
- A régi gyorsítótárak maguktól törlődnek. Az előző verzió gyorsítótára egy ideig még megmarad, hogy az épp átváltó lap ne akadjon el.

## Ismert korlátok

- **Szinonimák**: a gép csak a kártyán felsorolt alternatívákat ismeri fel szinonimaként. Minden másra ott a „Mégis jó volt” gomb, és ha be van állítva, az AI magyarázat megítéli a választ.
- **Felolvasás**: a böngésző beépített hangjait használja. A minőség eszközfüggő, iPhone-on a telepített hangokon múlik.
- **Offline**: csak a nyilvános és a saját készletek menthetők offline, és csak szövegként (kép nélkül). A védett csoportok tartalma szándékosan nem kerül az eszközre. Offline csak egyszerű kártyázás van; ami nem aznap történt, azt a sorozat már nem tudja jóváírni.
- **Értesítések időzítése**: az emlékeztetők óránként egyszer mennek ki, így pár perces csúszás lehet. A Vercel Hobby csomagon a cron futások ideje egy órán belül változhat.

## Fejlesztőknek

```bash
npm install
cp .env.example .env.local            # helyi Postgres címe stb.
npm run migrate && npm run dev        # http://localhost:3000
npm test                              # egységtesztek
npx next build && npx playwright test # végponttól végpontig tesztek (flashly_test adatbázis kell)
npm run db:generate                   # új migráció a séma módosítása után
```
