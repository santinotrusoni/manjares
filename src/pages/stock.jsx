// src/pages/Stock.jsx
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../services/supabase";

function formatARS(n) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n ?? 0);
}
function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const UNIDADES = ["unidad","kg","g","litro","ml","docena","caja","paquete"];
const EMPTY_PROD = { nombre: "", descripcion: "", precio: "", stock_actual: "", stock_minimo: "5", unidad: "unidad" };
const EMPTY_MOV  = { tipo: "entrada", cantidad: "", motivo: "" };

export default function Stock({ user }) {
  const [productos, setProductos]     = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [usuarios, setUsuarios]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [subTab, setSubTab]           = useState("productos"); // "productos" | "movimientos"
  const [modalProd, setModalProd]     = useState(null); // null | "nuevo" | producto
  const [modalMov, setModalMov]       = useState(null); // null | producto
  const [formProd, setFormProd]       = useState(EMPTY_PROD);
  const [formMov, setFormMov]         = useState(EMPTY_MOV);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast, setToast]             = useState(null);
  const [searchProd, setSearchProd]   = useState("");

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: prods }, { data: movs }, { data: usrs }] = await Promise.all([
      supabase.from("productos").select("*").order("nombre"),
      supabase.from("stock_movimientos").select("*, productos(nombre)").order("created_at", { ascending: false }).limit(100),
      supabase.from("usuarios").select("id, nombre, apellido"),
    ]);
    setProductos(prods ?? []);
    setMovimientos(movs ?? []);
    setUsuarios(usrs ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getNombre = (id) => {
    const u = usuarios.find(u => u.id === id);
    return u ? `${u.nombre} ${u.apellido}` : "—";
  };

  // ── Producto CRUD ──────────────────────────────────────────────
  const openNuevo = () => { setFormProd(EMPTY_PROD); setModalProd("nuevo"); };
  const openEdit  = (p)  => { setFormProd({ nombre: p.nombre, descripcion: p.descripcion ?? "", precio: p.precio, stock_actual: p.stock_actual, stock_minimo: p.stock_minimo, unidad: p.unidad }); setModalProd(p); };

  const handleProdChange = (e) => setFormProd(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSaveProd = async () => {
    if (!formProd.nombre.trim()) { showToast("El nombre es obligatorio.", "error"); return; }
    if (isNaN(Number(formProd.precio)) || Number(formProd.precio) < 0) { showToast("Precio inválido.", "error"); return; }
    setFormLoading(true);
    const payload = {
      nombre:       formProd.nombre.trim(),
      descripcion:  formProd.descripcion.trim() || null,
      precio:       parseFloat(formProd.precio) || 0,
      stock_actual: parseFloat(formProd.stock_actual) || 0,
      stock_minimo: parseFloat(formProd.stock_minimo) || 0,
      unidad:       formProd.unidad,
    };
    const { error } = modalProd === "nuevo"
      ? await supabase.from("productos").insert([payload])
      : await supabase.from("productos").update(payload).eq("id", modalProd.id);
    setFormLoading(false);
    if (error) { showToast("Error al guardar.", "error"); return; }
    showToast(modalProd === "nuevo" ? "Producto creado." : "Producto actualizado.");
    setModalProd(null);
    fetchData();
  };

  const handleToggleActivo = async (p) => {
    await supabase.from("productos").update({ activo: !p.activo }).eq("id", p.id);
    showToast(p.activo ? "Producto desactivado." : "Producto activado.");
    fetchData();
  };

  const handleDeleteProd = async () => {
    if (!deleteConfirm) return;
    await supabase.from("productos").delete().eq("id", deleteConfirm.id);
    setDeleteConfirm(null);
    showToast("Producto eliminado.");
    fetchData();
  };

  // ── Movimiento manual ──────────────────────────────────────────
  const openMov = (prod) => { setFormMov(EMPTY_MOV); setModalMov(prod); };

  const handleMovChange = (e) => setFormMov(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSaveMov = async () => {
    if (!formMov.cantidad || isNaN(Number(formMov.cantidad)) || Number(formMov.cantidad) <= 0) {
      showToast("Ingresá una cantidad válida.", "error"); return;
    }
    setFormLoading(true);
    const cantidad = parseFloat(formMov.cantidad);
    const prod     = modalMov;

    let nuevoStock = prod.stock_actual;
    if (formMov.tipo === "entrada") nuevoStock += cantidad;
    else if (formMov.tipo === "salida") {
      if (cantidad > prod.stock_actual) { setFormLoading(false); showToast("Stock insuficiente.", "error"); return; }
      nuevoStock -= cantidad;
    } else {
      nuevoStock = cantidad; // ajuste = valor absoluto
    }

    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("productos").update({ stock_actual: nuevoStock }).eq("id", prod.id),
      supabase.from("stock_movimientos").insert([{
        producto_id: prod.id,
        tipo:        formMov.tipo,
        cantidad,
        motivo:      formMov.motivo.trim() || null,
        usuario_id:  user?.id,
      }]),
    ]);
    setFormLoading(false);
    if (e1 || e2) { showToast("Error al registrar movimiento.", "error"); return; }
    showToast("Movimiento registrado.");
    setModalMov(null);
    fetchData();
  };

  // ── Derived ────────────────────────────────────────────────────
  const productosFiltrados = productos.filter(p =>
    p.nombre.toLowerCase().includes(searchProd.toLowerCase())
  );
  const stockBajo   = productos.filter(p => p.activo && p.stock_actual <= p.stock_minimo);
  const totalValor  = productos.filter(p => p.activo).reduce((s,p) => s + p.stock_actual * p.precio, 0);

  const tipoColor = { entrada: "#10b981", salida: "#ef4444", ajuste: "#f59e0b" };
  const tipoLabel = { entrada: "↑ Entrada", salida: "↓ Salida", ajuste: "⟳ Ajuste" };

  return (
    <div className="stock-root">

      {/* Alertas stock bajo */}
      {stockBajo.length > 0 && (
        <div className="stock-alert-banner">
          <span className="stock-alert-icon">⚠</span>
          <span><strong>{stockBajo.length} producto{stockBajo.length > 1 ? "s" : ""}</strong> con stock bajo:&nbsp;
            {stockBajo.map(p => p.nombre).join(", ")}
          </span>
        </div>
      )}

      {/* KPIs */}
      <div className="stock-kpis">
        <div className="stock-kpi">
          <div className="kpi-label">Total productos</div>
          <div className="kpi-value">{productos.filter(p => p.activo).length}</div>
        </div>
        <div className="stock-kpi">
          <div className="kpi-label">Valor en stock</div>
          <div className="kpi-value">{formatARS(totalValor)}</div>
        </div>
        <div className="stock-kpi stock-kpi-warn">
          <div className="kpi-label">Stock bajo</div>
          <div className="kpi-value">{stockBajo.length}</div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="stock-tabs">
        <button className={`stock-tab${subTab === "productos" ? " active" : ""}`} onClick={() => setSubTab("productos")}>Productos</button>
        <button className={`stock-tab${subTab === "movimientos" ? " active" : ""}`} onClick={() => setSubTab("movimientos")}>Historial de movimientos</button>
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /><span>Cargando stock...</span></div>
      ) : (
        <>
          {/* ── PRODUCTOS ── */}
          {subTab === "productos" && (
            <div className="stock-section">
              <div className="stock-toolbar">
                <input
                  className="field-input stock-search"
                  placeholder="Buscar producto..."
                  value={searchProd}
                  onChange={e => setSearchProd(e.target.value)}
                />
                <button className="btn-primary" onClick={openNuevo}>+ Producto</button>
              </div>
              <div className="table-card">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Precio</th>
                      <th>Stock</th>
                      <th>Mínimo</th>
                      <th>Estado</th>
                      <th>Valor total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {productosFiltrados.length === 0 ? (
                      <tr><td colSpan={7} className="empty-row">Sin productos. Creá el primero.</td></tr>
                    ) : productosFiltrados.map(p => {
                      const bajo = p.activo && p.stock_actual <= p.stock_minimo;
                      return (
                        <tr key={p.id} className={bajo ? "row-warn" : ""}>
                          <td>
                            <div className="prod-name">{p.nombre}</div>
                            {p.descripcion && <div className="prod-desc-sm">{p.descripcion}</div>}
                          </td>
                          <td className="amount">{formatARS(p.precio)}</td>
                          <td>
                            <span className={`stock-qty${bajo ? " stock-qty-low" : ""}`}>
                              {p.stock_actual} <span className="stock-unit">{p.unidad}</span>
                              {bajo && <span className="stock-low-badge">⚠ Bajo</span>}
                            </span>
                          </td>
                          <td className="col-notes">{p.stock_minimo} {p.unidad}</td>
                          <td>
                            <span className={`badge ${p.activo ? "badge-ing" : "badge-off"}`}>
                              {p.activo ? "Activo" : "Inactivo"}
                            </span>
                          </td>
                          <td className="amount">{formatARS(p.stock_actual * p.precio)}</td>
                          <td>
                            <div className="action-group">
                              <button className="btn-action" onClick={() => openMov(p)} title="Movimiento">↕</button>
                              <button className="btn-action" onClick={() => openEdit(p)} title="Editar">✎</button>
                              <button className="btn-action btn-action-toggle" onClick={() => handleToggleActivo(p)} title={p.activo ? "Desactivar" : "Activar"}>
                                {p.activo ? "⊘" : "✓"}
                              </button>
                              <button className="btn-delete" onClick={() => setDeleteConfirm(p)} title="Eliminar">✕</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── MOVIMIENTOS ── */}
          {subTab === "movimientos" && (
            <div className="stock-section">
              <div className="table-card">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Producto</th>
                      <th>Tipo</th>
                      <th>Cantidad</th>
                      <th>Motivo</th>
                      <th>Registrado por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.length === 0 ? (
                      <tr><td colSpan={6} className="empty-row">Sin movimientos registrados.</td></tr>
                    ) : movimientos.map(m => (
                      <tr key={m.id}>
                        <td className="col-date">{formatDate(m.created_at)}</td>
                        <td>{m.productos?.nombre ?? "—"}</td>
                        <td>
                          <span className="mov-badge" style={{ background: tipoColor[m.tipo] + "22", color: tipoColor[m.tipo] }}>
                            {tipoLabel[m.tipo]}
                          </span>
                        </td>
                        <td className={`amount ${m.tipo === "entrada" ? "amount-pos" : m.tipo === "salida" ? "amount-neg" : ""}`}>
                          {m.tipo === "entrada" ? "+" : m.tipo === "salida" ? "-" : "="}{m.cantidad}
                        </td>
                        <td className="col-notes">{m.motivo ?? "—"}</td>
                        <td className="col-notes">{getNombre(m.usuario_id)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal producto */}
      {modalProd && (
        <div className="modal-overlay" onClick={() => setModalProd(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{modalProd === "nuevo" ? "Nuevo producto" : "Editar producto"}</h2>
              <button className="modal-close" onClick={() => setModalProd(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label className="field-label">Nombre *</label>
                <input className="field-input" name="nombre" value={formProd.nombre} onChange={handleProdChange} placeholder="Ej: Alfajor de chocolate" autoFocus />
              </div>
              <div className="field">
                <label className="field-label">Descripción</label>
                <input className="field-input" name="descripcion" value={formProd.descripcion} onChange={handleProdChange} placeholder="Opcional" />
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="field-label">Precio (ARS) *</label>
                  <div className="monto-wrap">
                    <span className="monto-prefix">$</span>
                    <input className="field-input monto-input" name="precio" type="number" min="0" step="0.01" value={formProd.precio} onChange={handleProdChange} placeholder="0.00" />
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">Unidad</label>
                  <select className="field-input" name="unidad" value={formProd.unidad} onChange={handleProdChange}>
                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="field-label">Stock actual</label>
                  <input className="field-input" name="stock_actual" type="number" min="0" step="0.5" value={formProd.stock_actual} onChange={handleProdChange} placeholder="0" />
                </div>
                <div className="field">
                  <label className="field-label">Stock mínimo</label>
                  <input className="field-input" name="stock_minimo" type="number" min="0" step="0.5" value={formProd.stock_minimo} onChange={handleProdChange} placeholder="5" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setModalProd(null)} disabled={formLoading}>Cancelar</button>
              <button className="btn-primary" onClick={handleSaveProd} disabled={formLoading}>{formLoading ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal movimiento */}
      {modalMov && (
        <div className="modal-overlay" onClick={() => setModalMov(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Movimiento — {modalMov.nombre}</h2>
              <button className="modal-close" onClick={() => setModalMov(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="mov-stock-actual">
                Stock actual: <strong>{modalMov.stock_actual} {modalMov.unidad}</strong>
              </div>
              <div className="field">
                <label className="field-label">Tipo</label>
                <div className="mov-tipo-group">
                  {["entrada","salida","ajuste"].map(t => (
                    <button
                      key={t}
                      className={`mov-tipo-btn${formMov.tipo === t ? " selected" : ""}`}
                      style={formMov.tipo === t ? { borderColor: tipoColor[t], background: tipoColor[t] + "18", color: tipoColor[t] } : {}}
                      onClick={() => setFormMov(f => ({ ...f, tipo: t }))}
                    >
                      {tipoLabel[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label className="field-label">{formMov.tipo === "ajuste" ? "Nuevo stock" : "Cantidad"} *</label>
                <input className="field-input" name="cantidad" type="number" min="0" step="0.5" value={formMov.cantidad} onChange={handleMovChange} placeholder="0" autoFocus />
              </div>
              <div className="field">
                <label className="field-label">Motivo</label>
                <input className="field-input" name="motivo" value={formMov.motivo} onChange={handleMovChange} placeholder="Ej: Compra a proveedor, merma..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setModalMov(null)} disabled={formLoading}>Cancelar</button>
              <button className="btn-primary" onClick={handleSaveMov} disabled={formLoading}>{formLoading ? "Guardando..." : "Confirmar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Eliminar producto</h2>
              <button className="modal-close" onClick={() => setDeleteConfirm(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="confirm-text">¿Eliminás <strong>"{deleteConfirm.nombre}"</strong>? Se perderá todo su historial de movimientos.</p>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
              <button className="btn-danger" onClick={handleDeleteProd}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className="toast-icon">{toast.type === "success" ? "✓" : "✕"}</span>
          {toast.msg}
        </div>
      )}
    </div>
  );
}