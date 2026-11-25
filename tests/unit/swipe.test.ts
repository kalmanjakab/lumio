import { describe, expect, it } from "vitest";
import { lockGesture, swipeDecision, swipeProgress, swipeThreshold } from "@/lib/swipe";

describe("Kártyahúzás", () => {
  it("a küszöb a kártya szélességéhez igazodik", () => {
    expect(swipeThreshold(300)).toBe(84);
    expect(swipeThreshold(100)).toBe(80);
    expect(swipeThreshold(2000)).toBe(140);
  });
  it("a majdnem függőleges mozdulat görgetés, a vízszintes és az átlós húzás", () => {
    expect(lockGesture(3, 4)).toBeNull();
    expect(lockGesture(2, 30)).toBe("scroll");
    expect(lockGesture(30, 2)).toBe("swipe");
    expect(lockGesture(20, -20)).toBe("swipe");
    expect(lockGesture(-15, -25)).toBe("swipe");
  });
  it("jobbra = tudom, balra = nem tudom, átlósan is", () => {
    expect(swipeDecision(120, 0, 0, 100)).toBe("right");
    expect(swipeDecision(-120, 10, 0, 100)).toBe("left");
    expect(swipeDecision(80, -90, 0, 100)).toBe("right");
    expect(swipeDecision(-75, -80, 0, 100)).toBe("left");
  });
  it("kevés húzásnál és függőlegesnél nem dönt", () => {
    expect(swipeDecision(60, 0, 0.1, 100)).toBeNull();
    expect(swipeDecision(20, 200, 0, 100)).toBeNull();
    expect(swipeDecision(0, 0, 0, 100)).toBeNull();
  });
  it("gyors pöccintés rövidebb húzásnál is számít, de csak a húzás irányában", () => {
    expect(swipeDecision(50, 0, 0.9, 100)).toBe("right");
    expect(swipeDecision(50, 0, -0.9, 100)).toBeNull();
  });
  it("a visszajelzés erőssége 0 és 1 között nő", () => {
    expect(swipeProgress(0, 0, 100)).toBe(0);
    expect(swipeProgress(50, 0, 100)).toBeGreaterThan(0);
    expect(swipeProgress(200, 0, 100)).toBe(1);
  });
});
