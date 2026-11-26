#!/usr/bin/env python3
"""Flashly kártyakészlet feltöltése az import API-n keresztül.

Használat:
    python3 upload.py set.json [--dry-run] [--split]

Az API-kulcsot a FLASHLY_API_KEY környezeti változóból, vagy a skill mappájában lévő
config.json-ból olvassa. A kulcsot soha nem írja ki. Csak a Python standard könyvtárát használja.
Kimenet: egyetlen JSON objektum a standard kimeneten.
"""
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request

MAX_CARDS = 1000
MAX_BODY = 1_000_000
LIMITS = {"title": 120, "description": 500, "front": 1000, "back": 2000}
ALLOWED_TOP = {"title", "description", "groupId", "termLang", "definitionLang", "cards"}
CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
LANG = re.compile(r"^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,2}$")
DEFAULT_BASE = "https://flashly.vercel.app"
SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def out(obj, code=0):
    print(json.dumps(obj, ensure_ascii=False, indent=2))
    sys.exit(code)


def load_config():
    cfg = {}
    path = os.path.join(SKILL_DIR, "config.json")
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                cfg = json.load(f)
        except Exception:
            out({"ok": False, "error": "bad_config", "message": "A config.json nem olvasható. Töltsd le újra a skillt."}, 2)
    key = (os.environ.get("FLASHLY_API_KEY") or cfg.get("apiKey") or "").strip()
    base = (os.environ.get("FLASHLY_BASE_URL") or cfg.get("baseUrl") or DEFAULT_BASE).strip().rstrip("/")
    return key, base


def normalize(data):
    """Ellenőrzi és egységesíti a készletet; hibalistát ad vissza."""
    issues = []
    if not isinstance(data, dict):
        return None, ["A JSON gyökere objektum legyen."]
    extra = set(data) - ALLOWED_TOP
    if extra:
        issues.append(f"Ismeretlen mező(k): {', '.join(sorted(extra))}")
    title = str(data.get("title") or "").strip()
    if not title:
        issues.append("Hiányzik a title.")
    elif len(title) > LIMITS["title"]:
        issues.append(f"A title legfeljebb {LIMITS['title']} karakter lehet.")
    desc = str(data.get("description") or "").strip()
    if len(desc) > LIMITS["description"]:
        issues.append(f"A description legfeljebb {LIMITS['description']} karakter lehet.")
    for k in ("termLang", "definitionLang"):
        if k in data and not (isinstance(data[k], str) and LANG.match(data[k].strip())):
            issues.append(f"Hibás {k}: például en-GB vagy hu-HU legyen.")
    cards_in = data.get("cards")
    if not isinstance(cards_in, list) or not cards_in:
        issues.append("A cards legyen nem üres lista.")
        cards_in = []
    cards, seen = [], set()
    for i, c in enumerate(cards_in):
        if not isinstance(c, dict):
            issues.append(f"cards[{i}]: objektum legyen.")
            continue
        front = str(c.get("front", c.get("term", "")) or "").strip()
        back = str(c.get("back", c.get("definition", "")) or "").strip()
        if not front or not back:
            issues.append(f"cards[{i}]: üres eleje vagy hátulja.")
            continue
        if len(front) > LIMITS["front"] or len(back) > LIMITS["back"]:
            issues.append(f"cards[{i}]: túl hosszú (eleje max {LIMITS['front']}, hátulja max {LIMITS['back']} karakter).")
            continue
        if CONTROL.search(front) or CONTROL.search(back):
            issues.append(f"cards[{i}]: tiltott vezérlőkaraktert tartalmaz.")
            continue
        if front.lower() in seen:
            continue  # ismétlődő kártya: kihagyjuk
        seen.add(front.lower())
        cards.append({"front": front, "back": back})
    body = {"title": title, "cards": cards}
    if desc:
        body["description"] = desc
    for k in ("termLang", "definitionLang"):
        if k in data:
            body[k] = data[k].strip()
    if data.get("groupId"):
        body["groupId"] = str(data["groupId"]).strip()
    return body, issues


def split_parts(body):
    chunks = [body["cards"][i:i + MAX_CARDS] for i in range(0, len(body["cards"]), MAX_CARDS)]
    if len(chunks) == 1:
        return [body]
    parts = []
    for n, chunk in enumerate(chunks, 1):
        suffix = f" ({n}/{len(chunks)})"
        part = dict(body, cards=chunk, title=body["title"][: LIMITS["title"] - len(suffix)] + suffix)
        parts.append(part)
    return parts


def post(base, key, body):
    raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
    if len(raw) > MAX_BODY:
        return {"ok": False, "error": "payload_too_large", "message": "A készlet nagyobb 1 MB-nál; bontsd kisebb részekre."}
    idem = "skill-" + hashlib.sha256(raw).hexdigest()[:40]
    req = urllib.request.Request(
        base + "/api/v1/sets",
        data=raw,
        method="POST",
        headers={
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
            "Idempotency-Key": idem,
            "User-Agent": "flashly-import-skill/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            res = json.loads(r.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        try:
            res = json.loads(e.read().decode("utf-8") or "{}")
        except Exception:
            res = {}
        from_api = "ok" in res
        res.setdefault("ok", False)
        res.setdefault("error", f"http_{e.code}")
        res.setdefault("message", f"A szerver {e.code} hibát adott.")
        res["status"] = e.code
        if e.code == 429 and e.headers.get("Retry-After"):
            res["retryAfterSeconds"] = int(e.headers["Retry-After"])
        if not from_api:
            res["hint"] = "Lehet, hogy a kódfuttató környezet hálózati szabálya blokkolja a domaint."
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return {
            "ok": False,
            "error": "network_error",
            "message": f"Nem érem el a szervert ({base}): {getattr(e, 'reason', e)}",
            "hint": "Engedélyezd a domaint a Claude kódfuttatás hálózati beállításaiban.",
        }
    if res.get("url"):
        res["link"] = base + res["url"]
    elif res.get("setId"):
        res["link"] = f"{base}/sets/{res['setId']}"
    return res


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    if len(args) != 1:
        out({"ok": False, "error": "usage", "message": "Használat: upload.py set.json [--dry-run] [--split]"}, 2)
    try:
        with open(args[0], encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        out({"ok": False, "error": "invalid_json", "message": f"A fájl nem olvasható JSON-ként: {e}"}, 2)

    body, issues = normalize(data)
    if issues:
        out({"ok": False, "error": "validation_failed", "message": "A készlet hibás.", "issues": issues}, 1)
    if len(body["cards"]) > MAX_CARDS and "--split" not in flags:
        out({"ok": False, "error": "too_many_cards", "message": f"{len(body['cards'])} kártya van, egy készletbe legfeljebb {MAX_CARDS} fér. Futtasd --split kapcsolóval."}, 1)
    parts = split_parts(body)

    key, base = load_config()
    if "--dry-run" in flags:
        out({"ok": True, "dryRun": True, "target": base, "keyConfigured": len(key) >= 32,
             "sets": [{"title": p["title"], "cardCount": len(p["cards"])} for p in parts]})
    if len(key) < 32:
        out({"ok": False, "error": "missing_key", "message": "Nincs beállítva az API-kulcs (config.json vagy FLASHLY_API_KEY)."}, 2)

    results = [post(base, key, p) for p in parts]
    ok = all(r.get("ok") for r in results)
    out(results[0] if len(results) == 1 else {"ok": ok, "sets": results}, 0 if ok else 1)


if __name__ == "__main__":
    main()
