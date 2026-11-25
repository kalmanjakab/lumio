import { desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { UserActions } from "@/components/admin/admin-forms";

const fmt = new Intl.DateTimeFormat("hu-HU", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Budapest" });

export default async function AdminUsersPage() {
  const users = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      createdAt: schema.users.createdAt,
      lastLoginAt: schema.users.lastLoginAt,
      mustChangePassword: schema.users.mustChangePassword,
    })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt));
  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold">Felhasználók ({users.length})</h1>
      <p className="mb-4 text-sm text-muted">
        Elfelejtett jelszónál állíts be ideiglenes jelszót: a felhasználó belépés után köteles újat választani.
      </p>
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
              </div>
              <UserActions id={u.id} username={u.username} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
