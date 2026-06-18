import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { queryKeys, fetchMembers } from "../lib/queries";
import type { Role } from "../types";

export function TeamPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading: loading } = useQuery({
    queryKey: queryKeys.members(),
    queryFn: fetchMembers,
  });
  const members = data?.members ?? [];

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("MEMBER");
  const [formError, setFormError] = useState("");

  const addMutation = useMutation({
    mutationFn: (body: { name: string; email: string; password: string; role: Role }) =>
      api("/members", { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members() });
      setName(""); setEmail(""); setPassword(""); setRole("MEMBER");
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : "Erreur"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/members/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.members() }),
    onError: (err) => alert(err instanceof Error ? err.message : "Erreur"),
  });

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    addMutation.mutate({ name, email, password, role });
  }

  function handleDelete(id: string) {
    if (!confirm("Supprimer ce membre ?")) return;
    deleteMutation.mutate(id);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Gestion des membres</h1>
      <p className="mt-1 text-sm text-slate-500">Crée des comptes et gère les accès de ton équipe.</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[340px_1fr]">
        <section className="h-fit rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">Ajouter un membre</h2>
          <form onSubmit={handleAdd} className="mt-4 space-y-3">
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Nom complet"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="Email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Mot de passe (min. 6)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
            <select value={role} onChange={(e) => setRole(e.target.value as Role)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
              <option value="MEMBER">Membre</option>
              <option value="ADMIN">Admin</option>
            </select>

            {formError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
            )}

            <button type="submit" disabled={addMutation.isPending}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60">
              {addMutation.isPending ? "Ajout…" : "Ajouter le membre"}
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-900">Membres ({members.length})</h2>
          </div>

          {loading ? (
            <p className="px-6 py-8 text-center text-sm text-slate-400">Chargement…</p>
          ) : members.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-slate-400">Aucun membre pour l'instant.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Nom</th>
                  <th className="px-6 py-3 font-medium">Email</th>
                  <th className="px-6 py-3 font-medium">Rôle</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="px-6 py-3 font-medium text-slate-900">{m.name}</td>
                    <td className="px-6 py-3 text-slate-600">{m.email}</td>
                    <td className="px-6 py-3">
                      <span className={
                        m.role === "ADMIN"
                          ? "rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
                          : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                      }>
                        {m.role === "ADMIN" ? "Admin" : "Membre"}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      {m.id !== user?.id && (
                        <button
                          onClick={() => handleDelete(m.id)}
                          disabled={deleteMutation.isPending}
                          className="text-xs text-red-600 transition hover:text-red-800 disabled:opacity-50"
                        >
                          Supprimer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
