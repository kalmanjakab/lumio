import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { HashTool } from "@/components/admin/hash-tool";

export const metadata = { title: "Jelszó-hash generátor" };

// A Claude skill fájljai (kulcs nélkül). A kulcs csak a böngészőben kerül melléjük.
function readSkill(): { path: string; content: string }[] {
  const root = path.join(process.cwd(), "skills", "flashly-import");
  const out: { path: string; content: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name !== "config.json") out.push({ path: path.relative(root, full).split(path.sep).join("/"), content: readFileSync(full, "utf8") });
    }
  };
  try {
    walk(root);
  } catch {
    return [];
  }
  return out;
}

export default function HashPage() {
  return <HashTool skillFiles={readSkill()} />;
}
