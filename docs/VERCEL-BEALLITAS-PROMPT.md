# Prompt: a Flashly bekötése a Vercelre

Ezt a teljes szöveget másold be egy új AI-beszélgetésbe.

---

Segíts nekem lépésről lépésre beállítani egy kész webappot a Vercelen. Magyarul, röviden, hétköznapi nyelven válaszolj, és egyszerre mindig csak egy lépést adj. Ha szakszót használsz, egy mondatban mondd el, mit jelent. Ha képernyőképet küldök, abból mondd meg, hol tartok és mit kell csinálnom.

**Fontos biztonsági szabály:** soha ne kérd el tőlem a jelszavaimat, a hash-t vagy a titkos kulcsokat, és ne is írd ki őket. Ezeket én magam másolom be a Vercel felületén. Ha egy képernyőképen titkos érték látszana, szólj, hogy takarjam ki.

## Háttér (ami már kész)

- Az app neve **Flashly**. Ez egy tanulókártya webapp Next.js-ben, Neon Postgres adatbázissal. A kód kész, a GitHubon van: `kalmanjakab/lumio`, a `main` ágon.
- A Vercelen már létezik egy **flashly** nevű projekt a **Jakab's projects** csapatban. Ennek a címe ez lesz: `https://flashly.vercel.app`.
- A GitHubon a Vercel alkalmazás telepítve van, és hozzáfér a `lumio` repóhoz („Only select repositories”). Ezzel a GitHub oldali rész kész.
- A build parancs (`npm run build`) magától létrehozza az adatbázis-táblákat, ha van adatbázis. Ha nincs, ezt a részt kihagyja.

## A lépések

### 1. A repó összekötése a projekttel (ez még hiányzik)
1. Vercel → **flashly** projekt → **Settings** → **Git**.
2. Frissítsd az oldalt, majd kattints a fekete **GitHub** gombra.
3. A listában kattints a `kalmanjakab/lumio` melletti **Connect** gombra.
4. **Kész, ha:** a gombok helyén a `kalmanjakab/lumio` név látszik, a Production Branch pedig `main`.
5. Ha ezután nem indul magától telepítés: **Deployments** → **Create Deployment** (vagy „Deploy”), branch: `main`. Az első telepítés el is bukhat, mert még nincs adatbázis. Ezzel nincs baj.

### 2. Az adatbázis (Neon, ingyenes)
1. A **flashly** projektben: **Storage** fül → **Create Database** → **Neon** (Serverless Postgres).
2. Régió: **Frankfurt (eu-central-1)**. Csomag: az ingyenes (**Free**).
3. A végén **Connect Project** → **flashly**, és mindhárom környezet legyen bepipálva: Production, Preview, Development.
4. **Kész, ha:** a Settings → Environment Variables alatt megjelent a `DATABASE_URL` és a `DATABASE_URL_UNPOOLED` (és pár másik `PG...`/`POSTGRES...` változó). Ezeket a Vercel magától állítja be, nem kell hozzájuk nyúlni.

### 3. Telepítés, hogy elérhető legyen a hash-generátor oldal
1. **Deployments** → a legfelső sor jobb oldalán **⋯** → **Redeploy**.
2. Várd meg, amíg **Ready** (zöld) lesz.
3. Nyisd meg: `https://flashly.vercel.app`. Ha betölt a főoldal, jó.
4. Ha a build **Error** lett: kattints rá, másold ki a piros hibaüzenetet (a Build Logs aljáról), és mutasd meg. Titok ott nem szerepel.

### 4. A két titkos változó
1. Telefonon vagy gépen nyisd meg: `https://flashly.vercel.app/jakab-admin-page-do-not-touch/hash`
2. Írd be kétszer az admin jelszót (legalább 12 karakter), és nyomd meg a **Hash készítése** gombot. A hash a böngésződben készül, a jelszó nem megy el sehova.
3. Másold ki a kapott hosszú szöveget. Vercel → **Settings** → **Environment Variables** → **Add**:
   - Key: `ADMIN_PASSWORD_HASH`
   - Value: a kimásolt szöveg (pontosan, szóközök nélkül)
   - Környezet: Production, Preview, Development
   - Ha van „Sensitive” kapcsoló, kapcsold be.
4. A hash-oldalon nyomd meg a **Titok generálása** gombot, és ugyanígy add hozzá:
   - Key: `SESSION_SECRET`
   - Value: a generált szöveg
5. Az `ADMIN_PATH_SLUG` nem kötelező. Ha nem állítod be, az admin oldal címe `/jakab-admin-page-do-not-touch` marad.
6. **Kész, ha:** a listában ott van az `ADMIN_PASSWORD_HASH` és a `SESSION_SECRET`.

### 5. Újratelepítés és ellenőrzés
1. **Deployments** → legfelső sor → **⋯** → **Redeploy**. A változók csak ezután lépnek életbe.
2. Ha **Ready**, nézd meg ezeket:
   - `https://flashly.vercel.app`: betölt a főoldal.
   - Regisztrálj egy próbafiókot (felhasználónév és jelszó), és lépj be vele.
   - `https://flashly.vercel.app/jakab-admin-page-do-not-touch`: be tudsz-e lépni az admin jelszóval.
   - Az adminban hozz létre egy csoportot és benne egy készletet pár kártyával, aztán nézd meg felhasználóként is.
3. Ha minden működik, kész vagy. Ezután minden push a `main` ágra magától települ.

## Ha valami nem stimmel

- **Az admin belépés nem sikerül:** valószínűleg rossz a hash értéke (lemaradt egy darab, vagy szóköz került bele). Készíts új hash-t, írd felül a változót, és nyomj Redeploy-t.
- **„Vercel Authentication” bejelentkezést kér a megnyitott oldal:** ez a Deployment Protection. A `flashly.vercel.app` címnek nyilvánosnak kell lennie. Settings → **Deployment Protection** → a „Vercel Authentication” maradhat **Standard Protection** állásban, mert az csak az előnézeti címeket védi. Ha a fő cím mégis bejelentkezést kér, ellenőrizd, hogy tényleg a `flashly.vercel.app` címet nyitottad-e meg, és nem egy hosszú, véletlenszerű előnézeti címet.
- **A Node verzió:** a projekt a `package.json` alapján Node 22-t használ. Ha a Settings → General alatt más verzió áll, állítsd **22.x**-re.
- **A build adatbázis-hibával áll le:** ellenőrizd, hogy a 2. lépésben mindhárom környezethez be lett-e kötve a Neon.

A részletes leírás a repóban is megvan: `README.md` („Telepítés a Vercelre” rész).
