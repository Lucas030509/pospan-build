import { useState, useEffect } from "react";
import { getUsers, createUser, updateUser, deleteUser } from "./db";
import { Plus, Edit2, Trash2, Users, Shield } from "lucide-react";
import { notify, confirmAction } from "./lib/dialogs";

interface UsuariosProps {
    currentUser: any;
}

export default function Usuarios({ currentUser }: UsuariosProps) {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    // Form states
    const [name, setName] = useState("");
    const [pin, setPin] = useState("");
    const [role, setRole] = useState("cashier"); // admin, cashier
    const [permissions, setPermissions] = useState<Record<string, boolean>>({
        sales: true,
        inventory: false,
        recipes: false,
        reports: false,
        settings: false,
        users: false
    });

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await getUsers();
            setUsers(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleOpenModal = (user?: any) => {
        if (user) {
            setEditingId(user.id);
            setName(user.name);
            setPin(user.pin);
            setRole(user.role);
            try {
                if (user.permissions) {
                    setPermissions(JSON.parse(user.permissions));
                } else {
                    setPermissions({
                        sales: true,
                        inventory: user.role === 'admin',
                        recipes: user.role === 'admin',
                        reports: user.role === 'admin',
                        settings: user.role === 'admin',
                        users: user.role === 'admin'
                    });
                }
            } catch {
                setPermissions({
                    sales: true,
                    inventory: false,
                    recipes: false,
                    reports: false,
                    settings: false,
                    users: false
                });
            }
        } else {
            setEditingId(null);
            setName("");
            setPin("");
            setRole("cashier");
            setPermissions({
                sales: true,
                inventory: false,
                recipes: false,
                reports: false,
                settings: false,
                users: false
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (!name) return notify("Nombre requerido", 'warning');
            if (!editingId && !pin) return notify("PIN requerido", 'warning');
            if (pin && pin.length < 4) return notify("PIN debe tener al menos 4 dígitos", 'warning');

            const savedPerms = role === 'admin' ? {
                sales: true,
                inventory: true,
                recipes: true,
                reports: true,
                settings: true,
                users: true
            } : permissions;

            if (editingId) {
                if (editingId === currentUser?.id && role !== 'admin' && currentUser?.role === 'admin') {
                    return notify("No puedes cambiar tu propio rol de administrador a cajero para evitar un bloqueo de accesos accidental.", 'warning');
                }
                if (editingId === currentUser?.id && role === 'cashier' && !savedPerms.users) {
                    return notify("No puedes revocar tu propio permiso al módulo de usuarios para evitar perder el acceso a la administración.", 'warning');
                }
                // Si el PIN se deja vacío en edición, enviamos el PIN actual (que ya está en base de datos cifrado)
                const currentObj = users.find(u => u.id === editingId);
                const pinToSave = pin ? pin : (currentObj ? currentObj.pin : "");
                await updateUser(editingId, { name, pin: pinToSave, role, permissions: JSON.stringify(savedPerms) }, currentUser?.id);
            } else {
                await createUser({ name, pin, role, permissions: JSON.stringify(savedPerms) }, currentUser?.id);
            }
            setIsModalOpen(false);
            loadData();
        } catch (err: any) {
            console.error("Error saving user", err);
            await notify("Ocurrió un error al guardar el usuario.", 'error');
        }
    };

    const handleDelete = async (id: number) => {
        if (id === currentUser?.id) {
            await notify("No puedes eliminar al usuario activo con el que iniciaste sesión actualmente.", 'warning');
            return;
        }
        if (await confirmAction("¿Seguro que deseas eliminar a este usuario del sistema?")) {
            try {
                await deleteUser(id, currentUser?.id);
                loadData();
            } catch (err) {
                console.error("Error deleting user", err);
            }
        }
    };

    if (loading) return <div style={{ padding: '2rem' }}>Cargando usuarios...</div>;

    return (
        <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Users size={28} /> Control de Acceso (Usuarios)
                </h2>

                <button
                    onClick={() => handleOpenModal()}
                    className="pay-btn"
                    style={{ width: 'auto', padding: '0.8rem 1.5rem', display: 'flex', gap: '0.5rem' }}
                >
                    <Plus size={20} /> Nuevo Empleado
                </button>
            </div>

            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-light)' }}>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>ID</th>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>Nombre</th>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>PIN</th>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>Módulos</th>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>Registro</th>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user) => (
                            <tr key={user.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                <td style={{ padding: '1rem 1.5rem' }}>{user.id}</td>
                                <td style={{ padding: '1rem 1.5rem', fontWeight: 600 }}>{user.name}</td>
                                <td style={{ padding: '1rem 1.5rem' }}>{"*".repeat(6)}</td>
                                <td style={{ padding: '1rem 1.5rem' }}>
                                    {user.role === 'admin' ? (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--accent-primary)', fontWeight: 600 }}>
                                            <Shield size={16} /> Administrador
                                        </span>
                                    ) : (() => {
                                        let permsList: string[] = [];
                                        try {
                                            if (user.permissions) {
                                                const p = JSON.parse(user.permissions);
                                                if (p.sales) permsList.push("Ventas");
                                                if (p.inventory) permsList.push("Inv");
                                                if (p.recipes) permsList.push("Recetas");
                                                if (p.reports) permsList.push("Rep");
                                                if (p.settings) permsList.push("Ajustes");
                                                if (p.users) permsList.push("Usuarios");
                                            } else {
                                                permsList.push("Ventas");
                                            }
                                        } catch {
                                            permsList.push("Ventas");
                                        }
                                        return <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Cajero ({permsList.join(", ")})</span>;
                                    })()}
                                </td>
                                <td style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    {new Date(user.created_at).toLocaleDateString()}
                                </td>
                                <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                    <button
                                        onClick={() => handleOpenModal(user)}
                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginRight: '1rem' }}
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                    {users.length > 1 && (
                                        <button
                                            onClick={() => handleDelete(user.id)}
                                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}
                                            title={user.id === 1 ? "No puedes borrar al admin maestro" : ""}
                                            disabled={user.id === 1}
                                        >
                                            <Trash2 size={18} style={{ opacity: user.id === 1 ? 0.3 : 1 }} />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div style={{
                        backgroundColor: 'var(--bg-primary)', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '420px',
                        boxShadow: 'var(--shadow-md)', maxHeight: '90vh', overflowY: 'auto'
                    }}>
                        <h3 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>
                            {editingId ? "Editar Empleado" : "Registrar Empleado"}
                        </h3>
                        <form onSubmit={handleSave}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Nombre Completo</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Ej: Juan Pérez"
                                    required
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                                />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Clave de Ingreso (PIN)</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                                    placeholder={editingId ? "Dejar vacío para no cambiar PIN..." : "Mínimo 4 dígitos..."}
                                    required={!editingId}
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                                />
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Este será el número con el que el empleado abrirá la caja.</p>
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Nivel de Acceso</label>
                                <select
                                    value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                                >
                                    <option value="cashier">Cajero (Personalizable)</option>
                                    <option value="admin">Administrador (Acceso Total)</option>
                                </select>
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Módulos Autorizados</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', padding: '0.8rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                                    {[
                                        { key: 'sales', label: 'Punto de Venta' },
                                        { key: 'inventory', label: 'Inventario' },
                                        { key: 'recipes', label: 'Recetas y Prod.' },
                                        { key: 'reports', label: 'Reportes' },
                                        { key: 'settings', label: 'Ajustes' },
                                        { key: 'users', label: 'Usuarios y Bitácora' }
                                    ].map(perm => (
                                        <label key={perm.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                            <input
                                                type="checkbox"
                                                checked={role === 'admin' ? true : !!permissions[perm.key]}
                                                disabled={role === 'admin'}
                                                onChange={(e) => setPermissions(prev => ({ ...prev, [perm.key]: e.target.checked }))}
                                            />
                                            {perm.label}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    style={{ padding: '0.8rem 1.5rem', backgroundColor: 'transparent', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    style={{ padding: '0.8rem 1.5rem', backgroundColor: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                                >
                                    Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
