import { desc, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { UserActions, UserAiToggle } from "@/components/admin/admin-forms";
import { AI_DAILY_LIMIT, aiConfigured } from "@/lib/server/ai";

const fmt = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });

export default async function AdminUsersPage() {
  const users = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      createdAt: schema.users.createdAt,
      lastLoginAt: schema.users.lastLoginAt,
      mustChangePassword: schema.users.mustChangePassword,
      aiEnabled: schema.users.aiEnabled,
      aiWeek: sql<number>`(select count(*)::int from ai_usage a where a.user_id = "users"."id" and a.created_at > now() - interval '7 days')`,
      aiDay: sql<number>`(select count(*)::int from ai_usage a where a.user_id = "users"."id" and a.created_at > now() - interval '24 hours')`,
    })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt));
  const configured = aiConfigured();
  const aiUsers = users.filter((u) => u.aiEnabled).length;
  const aiWeekTotal = users.reduce((n, u) => n + Number(u.aiWeek), 0);
  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold">Felhasználók ({users.length})</h1>
      <p className="mb-4 text-sm text-muted">
        Elfelejtett jelszónál állíts be ideiglenes jelszót: a felhasználó belépés után köteles újat választani.
      </p>
      <div className="mb-4 rounded-2xl bg-surface p-4 text-sm shadow-card">
        <p className="font-bold">AI funkciók</p>
        <p className="text-muted">
          Alapból senkinél nincs bekapcsolva. Felhasználónként kapcsolhatod be; bekapcsoláskor értesítést kap. Korlát: {AI_DAILY_LIMIT} kérés / 24 óra / fő.
          {" "}Bekapcsolva: {aiUsers} fő · Hívások az elmúlt 7 napban: {aiWeekTotal}
        </p>
        {!configured ? (
          <p className="mt-2 font-semibold text-danger">A GROQ_API_KEY nincs beállítva a Vercelen, ezért az AI most senkinél nem működik.</p>
        ) : null}
      </div>
      {users.length === 0 ? (
        <p className="text-muted">Még nincs regisztrált felhasználó.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-card">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-bold">
                  {u.username}
                  {u.mustChangePassword ? <span className="ml-2 rounded-full bg-learning-soft px-2 py-0.5 text-xs text-learning">ideiglenes jelszó</span> : null}
                </p>
                <p className="text-sm text-muted">
                  Regisztrált: {fmt.format(u.createdAt)} · Utolsó belépés: {u.lastLoginAt ? fmt.format(u.lastLoginAt) : "–"}
                </p>
                <p className="text-sm text-muted" data-testid={`ai-usage-${u.username}`}>
                  AI hívások: {Number(u.aiWeek)} az elmúlt 7 napban · {Number(u.aiDay)}/{AI_DAILY_LIMIT} az elmúlt 24 órában
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <UserAiToggle id={u.id} username={u.username} enabled={u.aiEnabled} />
                <UserActions id={u.id} username={u.username} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
