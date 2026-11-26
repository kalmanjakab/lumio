import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

const OK_KEY = "teszt-kulcs-nem-valodi-0123456789abcdef";

function groqReply(content: unknown, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const card = { term: "apple", definition: "alma", termLang: "en", definitionLang: "hu", answer: "körte", locale: "hu" as const };

describe("Groq AI kliens", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GROQ_API_KEY = OK_KEY;
    delete process.env.GROQ_MODEL;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GROQ_API_KEY;
  });

  it("kulcs nélkül ki van kapcsolva", async () => {
    delete process.env.GROQ_API_KEY;
    const ai = await import("@/lib/server/ai");
    expect(ai.aiConfigured()).toBe(false);
  });

  it("JSON választ ad vissza, a kulcsot csak a fejlécben küldi", async () => {
    const fetchMock = vi.fn(async () => groqReply({ verdict: "wrong", explanation: "Az apple alma.", example: "I eat an apple." }));
    vi.stubGlobal("fetch", fetchMock);
    const ai = await import("@/lib/server/ai");
    const out = await ai.explainCard(card);
    expect(out).toEqual({ verdict: "wrong", explanation: "Az apple alma.", example: "I eat an apple." });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${OK_KEY}`);
    const body = JSON.parse(String(init.body));
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(String(init.body)).not.toContain(OK_KEY);
  });

  it("ha az első modell nem elérhető, a következővel próbálkozik", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 404 }))
      .mockResolvedValueOnce(groqReply({ mnemonic: "Ádám almája", tip: "" }));
    vi.stubGlobal("fetch", fetchMock);
    const ai = await import("@/lib/server/ai");
    expect(await ai.mnemonicForCard(card)).toEqual({ mnemonic: "Ádám almája", tip: "" });
    expect(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body)).model).toBe("llama-3.3-70b-versatile");
  });

  it("429-nél és hibás kulcsnál nem próbálkozik tovább", async () => {
    const ai = await import("@/lib/server/ai");
    const f1 = vi.fn(async () => new Response("{}", { status: 429 }));
    vi.stubGlobal("fetch", f1);
    await expect(ai.explainCard(card)).rejects.toMatchObject({ kind: "rate_limited" });
    expect(f1).toHaveBeenCalledTimes(1);
    const f2 = vi.fn(async () => new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", f2);
    await expect(ai.explainCard(card)).rejects.toMatchObject({ kind: "failed" });
    expect(f2).toHaveBeenCalledTimes(1);
  });

  it("hibás vagy sémán kívüli JSON-t elutasít", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => groqReply("nem json")));
    const ai = await import("@/lib/server/ai");
    await expect(ai.explainCard(card)).rejects.toMatchObject({ kind: "no_answer" });
    vi.stubGlobal("fetch", vi.fn(async () => groqReply({ tips: [] })));
    await expect(
      ai.studyTipsForSet({ title: "x", termLang: "en", definitionLang: "hu", cardCount: 1, knownCount: 0, studiedCount: 0, hard: [], locale: "hu" }),
    ).rejects.toMatchObject({ kind: "no_answer" });
  });

  it("GROQ_MODEL felülírja az alapmodellt, de csak érvényes névvel", async () => {
    process.env.GROQ_MODEL = "moonshotai/kimi-k2-instruct";
    const fetchMock = vi.fn(async () => groqReply({ mnemonic: "x", tip: "y" }));
    vi.stubGlobal("fetch", fetchMock);
    const ai = await import("@/lib/server/ai");
    await ai.mnemonicForCard(card);
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).model).toBe("moonshotai/kimi-k2-instruct");
  });
});
