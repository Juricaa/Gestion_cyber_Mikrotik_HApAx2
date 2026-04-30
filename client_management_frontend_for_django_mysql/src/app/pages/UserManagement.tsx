import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, RefreshCw, Save, Trash2, UserPlus, X } from "lucide-react";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuth } from "../context/AuthContext";
import {
  BackendUser,
  BackendUserPayload,
  BackendUserRole,
  createUserApi,
  deleteUserApi,
  fetchUsersApi,
  updateUserApi,
} from "../utils/api";

interface UserFormState {
  username: string;
  email: string;
  full_name: string;
  role: BackendUserRole;
  password: string;
  is_active: boolean;
}

const emptyForm: UserFormState = {
  username: "",
  email: "",
  full_name: "",
  role: "staff",
  password: "",
  is_active: true,
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function roleLabel(role: BackendUserRole, isSuperuser?: boolean) {
  if (role === "admin" || isSuperuser) return "Admin";
  if (role === "staff") return "Staff";
  return "Lecteur";
}

function roleBadgeVariant(role: BackendUserRole, isSuperuser?: boolean) {
  if (role === "admin" || isSuperuser) return "default";
  if (role === "staff") return "secondary";
  return "outline";
}

function buildPayload(form: UserFormState, includePassword: boolean): BackendUserPayload {
  const payload: BackendUserPayload = {
    username: form.username.trim(),
    email: form.email.trim(),
    full_name: form.full_name.trim(),
    role: form.role,
    is_active: form.is_active,
  };

  if (includePassword && form.password.trim()) {
    payload.password = form.password.trim();
  }

  return payload;
}

export function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<BackendUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createForm, setCreateForm] = useState<UserFormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<UserFormState>(emptyForm);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.id - b.id),
    [users],
  );

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await fetchUsersApi();
      setUsers(data);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Impossible de charger les utilisateurs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();

    if (!createForm.username.trim()) {
      toast.error("Nom d'utilisateur obligatoire");
      return;
    }

    if (!createForm.password.trim() || createForm.password.trim().length < 6) {
      toast.error("Mot de passe obligatoire, minimum 6 caractères");
      return;
    }

    setSaving(true);
    try {
      const created = await createUserApi(buildPayload(createForm, true));
      setUsers((prev) => [...prev, created]);
      setCreateForm(emptyForm);
      toast.success("Utilisateur créé");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Erreur création utilisateur");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (item: BackendUser) => {
    setEditingId(item.id);
    setEditForm({
      username: item.username || "",
      email: item.email || "",
      full_name: item.full_name || "",
      role: item.role || "staff",
      password: "",
      is_active: item.is_active !== false,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyForm);
  };

  const handleUpdate = async (id: number) => {
    if (!editForm.username.trim()) {
      toast.error("Nom d'utilisateur obligatoire");
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload(editForm, Boolean(editForm.password.trim()));
      const updated = await updateUserApi(id, payload);
      setUsers((prev) => prev.map((item) => (item.id === id ? updated : item)));
      cancelEdit();
      toast.success("Utilisateur modifié");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Erreur modification utilisateur");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: BackendUser) => {
    if (!window.confirm(`Supprimer l'utilisateur ${item.username} ?`)) return;

    setSaving(true);
    try {
      await deleteUserApi(item.id);
      setUsers((prev) => prev.filter((user) => user.id !== item.id));
      toast.success("Utilisateur supprimé");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Erreur suppression utilisateur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des utilisateurs</h1>
          <p className="text-sm text-gray-500">Créer, modifier, désactiver ou supprimer les comptes du système.</p>
        </div>
        <Button type="button" variant="outline" onClick={loadUsers} disabled={loading || saving}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Actualiser
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="w-5 h-5" />
            Nouvel utilisateur
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
            <div className="space-y-2">
              <Label>Nom d'utilisateur</Label>
              <Input value={createForm.username} onChange={(e) => setCreateForm((prev) => ({ ...prev, username: e.target.value }))} placeholder="ex: staff1" />
            </div>
            <div className="space-y-2">
              <Label>Nom complet</Label>
              <Input value={createForm.full_name} onChange={(e) => setCreateForm((prev) => ({ ...prev, full_name: e.target.value }))} placeholder="Nom complet" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={createForm.email} onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="email@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Rôle</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={createForm.role}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, role: e.target.value as BackendUserRole }))}
              >
                <option value="admin">Admin</option>
                <option value="staff">Staff</option>
                <option value="viewer">Lecteur</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Mot de passe</Label>
              <Input type="password" value={createForm.password} onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="Minimum 6 caractères" />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
              Créer
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Liste des utilisateurs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Chargement...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-3 pr-3">ID</th>
                    <th className="py-3 pr-3">Utilisateur</th>
                    <th className="py-3 pr-3">Email</th>
                    <th className="py-3 pr-3">Rôle</th>
                    <th className="py-3 pr-3">Statut</th>
                    <th className="py-3 pr-3">Dernière connexion</th>
                    <th className="py-3 pr-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((item) => {
                    const isEditing = editingId === item.id;
                    const isCurrentUser = currentUser?.id === item.id;

                    return (
                      <tr key={item.id} className="border-b last:border-b-0 align-top">
                        <td className="py-3 pr-3 text-gray-500">#{item.id}</td>
                        <td className="py-3 pr-3 min-w-52">
                          {isEditing ? (
                            <div className="space-y-2">
                              <Input value={editForm.username} onChange={(e) => setEditForm((prev) => ({ ...prev, username: e.target.value }))} />
                              <Input value={editForm.full_name} onChange={(e) => setEditForm((prev) => ({ ...prev, full_name: e.target.value }))} placeholder="Nom complet" />
                              <Input type="password" value={editForm.password} onChange={(e) => setEditForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="Nouveau mot de passe optionnel" />
                            </div>
                          ) : (
                            <div>
                              <div className="font-medium text-gray-900">{item.username}</div>
                              <div className="text-gray-500">{item.full_name || "-"}</div>
                              {isCurrentUser && <div className="text-xs text-blue-600 mt-1">Compte connecté</div>}
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-3 min-w-48">
                          {isEditing ? (
                            <Input type="email" value={editForm.email} onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))} />
                          ) : (
                            item.email || "-"
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          {isEditing ? (
                            <select
                              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={editForm.role}
                              onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value as BackendUserRole }))}
                            >
                              <option value="admin">Admin</option>
                              <option value="staff">Staff</option>
                              <option value="viewer">Lecteur</option>
                            </select>
                          ) : (
                            <Badge variant={roleBadgeVariant(item.role, item.is_superuser)}>{roleLabel(item.role, item.is_superuser)}</Badge>
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          {isEditing ? (
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={editForm.is_active}
                                disabled={isCurrentUser}
                                onChange={(e) => setEditForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                              />
                              Actif
                            </label>
                          ) : item.is_active === false ? (
                            <Badge variant="destructive">Désactivé</Badge>
                          ) : (
                            <Badge variant="outline">Actif</Badge>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-gray-500 min-w-40">{formatDate(item.last_login)}</td>
                        <td className="py-3 pr-0">
                          <div className="flex justify-end gap-2">
                            {isEditing ? (
                              <>
                                <Button size="sm" onClick={() => handleUpdate(item.id)} disabled={saving}>
                                  <Save className="w-4 h-4 mr-1" />
                                  Enregistrer
                                </Button>
                                <Button size="sm" variant="outline" onClick={cancelEdit} disabled={saving}>
                                  <X className="w-4 h-4 mr-1" />
                                  Annuler
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" onClick={() => startEdit(item)} disabled={saving}>
                                  <Pencil className="w-4 h-4 mr-1" />
                                  Modifier
                                </Button>
                                <Button size="sm" variant="destructive" onClick={() => handleDelete(item)} disabled={saving || isCurrentUser}>
                                  <Trash2 className="w-4 h-4 mr-1" />
                                  Supprimer
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {!sortedUsers.length && (
                <div className="py-10 text-center text-gray-500">Aucun utilisateur trouvé.</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
