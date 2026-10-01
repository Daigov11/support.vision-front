import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createUser, fetchUsers, updateUser } from "../api/users";
import type { UserDto } from "../types/auth";

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export function UsersAdmin() {
  const [users, setUsers] = useState<UserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await fetchUsers());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los usuarios.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggleActive = async (user: UserDto) => {
    setBusyUserId(user.id);
    try {
      await updateUser(user.id, { isActive: !user.isActive });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el usuario.");
    } finally {
      setBusyUserId(null);
    }
  };

  const handleResetPassword = async (user: UserDto) => {
    const newPassword = window.prompt(`Nueva contraseña temporal para ${user.email} (mínimo 8 caracteres):`);
    if (!newPassword) return;
    if (newPassword.length < 8) {
      window.alert("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setBusyUserId(user.id);
    try {
      await updateUser(user.id, { newPassword });
      window.alert("Contraseña actualizada. Comunícasela al usuario por un canal seguro.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo restablecer la contraseña.");
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="users-admin">
      <div className="users-admin__header">
        <h2>Usuarios</h2>
        <button type="button" onClick={() => setShowCreateForm((current) => !current)}>
          {showCreateForm ? "Cancelar" : "Nuevo usuario"}
        </button>
      </div>

      {showCreateForm && (
        <CreateUserForm
          onCreated={() => {
            setShowCreateForm(false);
            load();
          }}
        />
      )}

      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <p className="empty-state">Cargando…</p>
      ) : users.length === 0 ? (
        <p className="empty-state">No hay usuarios todavía.</p>
      ) : (
        <table className="users-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Nombre</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Último acceso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.email}</td>
                <td>{user.displayName}</td>
                <td>{user.role}</td>
                <td>
                  <span className={user.isActive ? "user-status user-status--active" : "user-status user-status--inactive"}>
                    {user.isActive ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td>{formatDate(user.lastLoginAt)}</td>
                <td className="users-table__actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={busyUserId === user.id}
                    onClick={() => handleToggleActive(user)}
                  >
                    {user.isActive ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busyUserId === user.id}
                    onClick={() => handleResetPassword(user)}
                  >
                    Restablecer contraseña
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("Support");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createUser({ email, displayName, role, password });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el usuario.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="create-user-form" onSubmit={handleSubmit}>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Nombre visible
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
      </label>
      <label>
        Rol
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="Support">Support</option>
          <option value="Admin">Admin</option>
        </select>
      </label>
      <label>
        Contraseña temporal
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
      </label>
      {error && <p className="error-text">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Creando…" : "Crear usuario"}
      </button>
    </form>
  );
}
