// A kártya-húzás döntési szabályai (tiszta függvények, hogy tesztelhetők legyenek).

/** Ennyi pixel mozgás után döntjük el, hogy húzás vagy görgetés kezdődött. */
export const SWIPE_SLOP = 10;
/** A függőlegestől ekkora szögön belül (fokban) görgetésnek vesszük a mozdulatot. */
const SCROLL_CONE_DEG = 25;
/** A vízszintestől legfeljebb ekkora szögben számít válasznak az elengedés (átlósan is). */
const MAX_ANSWER_ANGLE_DEG = 70;
/** Gyors „pöccintés”: ennyi px/ms vízszintes sebesség elég rövidebb húzásnál is. */
const FLING_VELOCITY = 0.5;
const FLING_MIN_DX = 40;

export type SwipeDir = "right" | "left";

/** A húzás küszöbe a kártya szélességéhez igazítva (keskeny telefonon kisebb). */
export function swipeThreshold(cardWidth: number): number {
  return Math.round(Math.min(140, Math.max(80, cardWidth * 0.28)));
}

/**
 * Az első mozdulatok alapján: a felhasználó a kártyát húzza („swipe”), vagy görget („scroll”).
 * A majdnem függőleges mozdulat görgetés, minden más (vízszintes és átlós) húzás.
 */
export function lockGesture(dx: number, dy: number): "swipe" | "scroll" | null {
  if (Math.hypot(dx, dy) < SWIPE_SLOP) return null;
  const angleFromVertical = (Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI;
  return angleFromVertical < SCROLL_CONE_DEG ? "scroll" : "swipe";
}

/** Elengedéskor: számít-e válasznak, és merre. */
export function swipeDecision(dx: number, dy: number, vx: number, threshold: number): SwipeDir | null {
  if (dx === 0) return null;
  const angleFromHorizontal = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
  if (angleFromHorizontal > MAX_ANSWER_ANGLE_DEG) return null;
  const dir: SwipeDir = dx > 0 ? "right" : "left";
  if (Math.hypot(dx, dy) >= threshold && Math.abs(dx) >= threshold * 0.45) return dir;
  if (Math.abs(dx) >= FLING_MIN_DX && Math.abs(vx) >= FLING_VELOCITY && Math.sign(vx) === Math.sign(dx)) return dir;
  return null;
}

/** 0..1 közötti érték: mennyire van közel a húzás a küszöbhöz (a visszajelzés erősségéhez). */
export function swipeProgress(dx: number, dy: number, threshold: number): number {
  if (dx === 0) return 0;
  return Math.min(1, Math.hypot(dx, dy) / threshold) * Math.min(1, Math.abs(dx) / (threshold * 0.45));
}
