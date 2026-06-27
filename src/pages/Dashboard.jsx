// src/pages/Dashboard.jsx
import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../services/supabase";
import Stock from "./stock";

const CATEGORIES  = ["Ingredientes","Packaging","Servicios","Personal","Otros"];
const METODOS     = ["Efectivo","Mercado Pago","Débito","Crédito"];
const MONTHS      = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function formatARS(n) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n ?? 0);
}
function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function Dashboard() {
  const [user, setUser]           = useState(null);
  const [perfil, setPerfil]       = useState(null);
  const [tab, setTab]             = useState("resumen");
  const [menuOpen, setMenuOpen]   = useState(false);
  const [ingresos, setIngresos]   = useState([]);
  const [gastos, setGastos]       = useState([]);
  const [ventas, setVentas]       = useState([]);
  const [usuarios, setUsuarios]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState(null);
  const [modalType, setModalType]         = useState(null);
  const [form, setForm]                   = useState({ descripcion: "", monto: "", categoria: CATEGORIES[0], fecha: new Date().toISOString().slice(0,10), notas: "" });
  const [formLoading, setFormLoading]     = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear,  setSelectedYear]  = useState(new Date().getFullYear());

  // ── Auth + perfil ──────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data?.user ?? null;
      setUser(u);
      if (u) {
        const { data: p } = await supabase.from("usuarios").select("*").eq("id", u.id).single();
        setPerfil(p ?? null);
      }
    });
  }, []);

  // ── Fetch ──────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: ing }, { data: gas }, { data: ven }, { data: usrs }] = await Promise.all([
      supabase.from("ingresos").select("*").order("fecha",    { ascending: false }),
      supabase.from("gastos").select("*").order("fecha",      { ascending: false }),
      supabase.from("ventas").select("*").order("created_at", { ascending: false }),
      supabase.from("usuarios").select("id, nombre, apellido, rol"),
    ]);
    setIngresos(ing  ?? []);
    setGastos(gas    ?? []);
    setVentas(ven    ?? []);
    setUsuarios(usrs ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Helpers ────────────────────────────────────────────────────
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const openModal = (type) => {
    setForm({ descripcion: "", monto: "", categoria: CATEGORIES[0], fecha: new Date().toISOString().slice(0,10), notas: "" });
    setModalType(type);
  };

  const handleFormChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.descripcion.trim() || !form.monto || isNaN(Number(form.monto)) || Number(form.monto) <= 0) {
      showToast("Completá descripción y monto válido.", "error"); return;
    }
    setFormLoading(true);
    const table   = modalType === "ingreso" ? "ingresos" : "gastos";
    const payload = {
      descripcion: form.descripcion.trim(),
      monto:       parseFloat(form.monto),
      fecha:       form.fecha,
      notas:       form.notas.trim() || null,
      user_id:     user?.id,
      ...(modalType === "gasto" ? { categoria: form.categoria } : {}),
    };
    const { error } = await supabase.from(table).insert([payload]);
    setFormLoading(false);
    if (error) { showToast("Error al guardar.", "error"); return; }
    showToast(`${modalType === "ingreso" ? "Ingreso" : "Gasto"} registrado.`);
    setModalType(null);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const { table, id } = deleteConfirm;
    const { error } = await supabase.from(table).delete().eq("id", id);
    setDeleteConfirm(null);
    if (error) { showToast("Error al eliminar.", "error"); return; }
    showToast("Registro eliminado.");
    fetchData();
  };

  // ── Filtros por mes ────────────────────────────────────────────
  const filterByMonth = (arr, dateField = "fecha") => arr.filter(r => {
    const d = new Date(r[dateField]);
    return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
  });

  const ingresosF = filterByMonth(ingresos);
  const gastosF   = filterByMonth(gastos);
  const ventasF   = filterByMonth(ventas, "created_at");

  const totalIngresos = ingresosF.reduce((s, r) => s + (r.monto  ?? 0), 0);
  const totalGastos   = gastosF.reduce((s, r)   => s + (r.monto  ?? 0), 0);
  const totalVentas   = ventasF.reduce((s, r)   => s + (r.total  ?? 0), 0);
  const balance       = totalIngresos + totalVentas - totalGastos;
  const margen        = (totalIngresos + totalVentas) > 0
    ? ((balance / (totalIngresos + totalVentas)) * 100).toFixed(1)
    : "—";

  // ── Chart ──────────────────────────────────────────────────────
  const last6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(selectedYear, selectedMonth - 5 + i, 1);
    const m = d.getMonth(); const y = d.getFullYear();
    const ing = [...ingresos, ...ventas.map(v => ({ ...v, monto: v.total, fecha: v.created_at?.slice(0,10) }))]
      .filter(r => { const rd = new Date(r.fecha + "T00:00:00"); return rd.getMonth() === m && rd.getFullYear() === y; })
      .reduce((s, r) => s + (r.monto ?? 0), 0);
    const gas = gastos
      .filter(r => { const rd = new Date(r.fecha + "T00:00:00"); return rd.getMonth() === m && rd.getFullYear() === y; })
      .reduce((s, r) => s + r.monto, 0);
    return { label: MONTHS[m], ing, gas };
  });
  const chartMax = Math.max(...last6.map(d => Math.max(d.ing, d.gas)), 1);

  // ── Gastos por categoría ───────────────────────────────────────
  const byCategory = CATEGORIES.map(cat => ({
    cat, total: gastosF.filter(g => g.categoria === cat).reduce((s,g) => s + g.monto, 0),
  })).filter(c => c.total > 0).sort((a,b) => b.total - a.total);
  const catColors = ["#6366f1","#f59e0b","#10b981","#ef4444","#8b5cf6"];

  // ── Ventas por método ──────────────────────────────────────────
  const byMetodo = METODOS.map(m => ({
    m,
    total: ventasF.filter(v => v.metodo_pago === m).reduce((s,v) => s + v.total, 0),
    count: ventasF.filter(v => v.metodo_pago === m).length,
  })).filter(x => x.total > 0);
  const metodoColors = { "Efectivo": "#10b981", "Mercado Pago": "#6366f1", "Débito": "#f59e0b", "Crédito": "#ef4444" };

  const getNombreUsuario = (id) => {
    const u = usuarios.find(u => u.id === id);
    return u ? `${u.nombre} ${u.apellido}` : "—";
  };

  const years = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);

  // ── Export Excel ───────────────────────────────────────────────
  const exportarExcel = () => {
    const mes  = MONTHS[selectedMonth];
    const anio = selectedYear;
    const wb   = XLSX.utils.book_new();

    const resumenData = [
      ["MANJARES — Resumen financiero", "", ""],
      [`Período: ${mes} ${anio}`, "", ""],
      ["", "", ""],
      ["Concepto", "Monto (ARS)", ""],
      ["Ventas del mes",  totalVentas,   ""],
      ["Otros ingresos",  totalIngresos, ""],
      ["Gastos del mes",  totalGastos,   ""],
      ["Balance neto",    balance,       ""],
      ["", "", ""],
      ["Margen (%)", margen !== "—" ? `${margen}%` : "—", ""],
    ];
    const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
    wsResumen["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen");

    const ventasHeaders = ["Fecha","Cliente","Descripción","Método de pago","Registrado por","Total (ARS)"];
    const ventasRows = ventasF.map(v => [formatDate(v.created_at), v.cliente, v.descripcion, v.metodo_pago, getNombreUsuario(v.usuario_id), v.total]);
    const wsVentas = XLSX.utils.aoa_to_sheet([ventasHeaders, ...ventasRows]);
    wsVentas["!cols"] = [{ wch: 14 },{ wch: 20 },{ wch: 30 },{ wch: 16 },{ wch: 22 },{ wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsVentas, "Ventas");

    const ingHeaders = ["Fecha","Descripción","Notas","Monto (ARS)"];
    const ingRows = ingresosF.map(r => [formatDate(r.fecha), r.descripcion, r.notas ?? "", r.monto]);
    const wsIng = XLSX.utils.aoa_to_sheet([ingHeaders, ...ingRows]);
    wsIng["!cols"] = [{ wch: 14 },{ wch: 30 },{ wch: 28 },{ wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsIng, "Ingresos");

    const gasHeaders = ["Fecha","Descripción","Categoría","Notas","Monto (ARS)"];
    const gasRows = gastosF.map(r => [formatDate(r.fecha), r.descripcion, r.categoria ?? "", r.notas ?? "", r.monto]);
    const wsGas = XLSX.utils.aoa_to_sheet([gasHeaders, ...gasRows]);
    wsGas["!cols"] = [{ wch: 14 },{ wch: 30 },{ wch: 16 },{ wch: 28 },{ wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsGas, "Gastos");

    const metHeaders = ["Método de pago","Cantidad de ventas","Total (ARS)"];
    const metRows = METODOS.map(m => {
      const vs = ventasF.filter(v => v.metodo_pago === m);
      return [m, vs.length, vs.reduce((s,v) => s + v.total, 0)];
    });
    const wsMet = XLSX.utils.aoa_to_sheet([metHeaders, ...metRows]);
    wsMet["!cols"] = [{ wch: 18 },{ wch: 20 },{ wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsMet, "Métodos de pago");

    XLSX.writeFile(wb, `Manjares_${mes}_${anio}.xlsx`);
  };

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className={`dash-root${menuOpen ? " sidebar-open" : ""}`}>

      {/* Overlay mobile */}
      <div className="sidebar-overlay" onClick={() => setMenuOpen(false)} />

      {/* Sidebar */}
      <aside className="dash-sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">🍬</span>
          <span className="brand-name">Manjares</span>
        </div>
        <nav className="sidebar-nav">
          {[
            { key: "resumen",  label: "Resumen",  icon: "◈" },
            { key: "ventas",   label: "Ventas",   icon: "🛒" },
            { key: "ingresos", label: "Ingresos", icon: "↑" },
            { key: "gastos",   label: "Gastos",   icon: "↓" },
            { key: "stock",    label: "Stock",    icon: "📦" },
          ].map(item => (
            <button
              key={item.key}
              className={`sidebar-link${tab === item.key ? " active" : ""}`}
              onClick={() => { setTab(item.key); setMenuOpen(false); }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">{user?.email?.[0]?.toUpperCase() ?? "U"}</div>
            <div className="user-info">
              <span className="user-email">{perfil ? `${perfil.nombre} ${perfil.apellido}` : user?.email}</span>
              <span className="user-role">{perfil?.rol === "admin" ? "Administrador" : "Empleado"}</span>
            </div>
          </div>
          <button className="btn-logout" onClick={handleLogout}>Salir</button>
        </div>
      </aside>

      {/* Main */}
      <main className="dash-main">

        {/* Topbar */}
        <header className="dash-topbar">
          <div className="topbar-left" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button className="btn-hamburger" onClick={() => setMenuOpen(o => !o)}>
              <span /><span /><span />
            </button>
            <h1 className="topbar-title">
              {tab === "resumen"  && "Resumen financiero"}
              {tab === "ventas"   && "Ventas"}
              {tab === "ingresos" && "Ingresos"}
              {tab === "gastos"   && "Gastos"}
              {tab === "stock"    && "Stock"}
            </h1>
          </div>
          <div className="topbar-right">
            <div className="period-selector">
              <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="period-select">
                {MONTHS.map((m,i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="period-select">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {tab !== "stock" && (
              <button className="btn-export" onClick={exportarExcel} title="Exportar a Excel">
                <span className="btn-export-icon">⬇</span> Excel
              </button>
            )}
            {tab === "ingresos" && <button className="btn-primary" onClick={() => openModal("ingreso")}>+ Ingreso</button>}
            {tab === "gastos"   && <button className="btn-primary" onClick={() => openModal("gasto")}>+ Gasto</button>}
          </div>
        </header>

        <div className="dash-content">
          {loading ? (
            <div className="loading-state"><div className="spinner" /><span>Cargando datos...</span></div>
          ) : (
            <>
              {/* ── RESUMEN ── */}
              {tab === "resumen" && (
                <div className="tab-resumen">
                  <div className="kpi-grid">
                    <div className="kpi-card kpi-ventas">
                      <div className="kpi-label">Ventas del mes</div>
                      <div className="kpi-value">{formatARS(totalVentas)}</div>
                      <div className="kpi-count">{ventasF.length} transacciones</div>
                    </div>
                    <div className="kpi-card kpi-ingresos">
                      <div className="kpi-label">Otros ingresos</div>
                      <div className="kpi-value">{formatARS(totalIngresos)}</div>
                      <div className="kpi-count">{ingresosF.length} registros</div>
                    </div>
                    <div className="kpi-card kpi-gastos">
                      <div className="kpi-label">Gastos del mes</div>
                      <div className="kpi-value">{formatARS(totalGastos)}</div>
                      <div className="kpi-count">{gastosF.length} registros</div>
                    </div>
                    <div className={`kpi-card ${balance >= 0 ? "kpi-balance-pos" : "kpi-balance-neg"}`}>
                      <div className="kpi-label">Balance neto</div>
                      <div className="kpi-value">{formatARS(balance)}</div>
                      <div className="kpi-count">Margen {margen !== "—" ? `${margen}%` : "—"}</div>
                    </div>
                  </div>

                  {byMetodo.length > 0 && (
                    <div className="metodos-row">
                      {byMetodo.map(x => (
                        <div className="metodo-card" key={x.m} style={{ borderTopColor: metodoColors[x.m] }}>
                          <div className="metodo-label">{x.m}</div>
                          <div className="metodo-value">{formatARS(x.total)}</div>
                          <div className="metodo-count">{x.count} ventas</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="analytics-row">
                    <div className="chart-card">
                      <div className="card-header">
                        <span className="card-title">Últimos 6 meses</span>
                        <div className="chart-legend">
                          <span className="legend-dot" style={{ background: "#6366f1" }} /> Ingresos
                          <span className="legend-dot" style={{ background: "#f87171" }} /> Gastos
                        </div>
                      </div>
                      <div className="bar-chart">
                        {last6.map((d,i) => (
                          <div key={i} className="bar-group">
                            <div className="bars">
                              <div className="bar bar-ing" style={{ height: `${(d.ing / chartMax) * 100}%` }} title={formatARS(d.ing)} />
                              <div className="bar bar-gas" style={{ height: `${(d.gas / chartMax) * 100}%` }} title={formatARS(d.gas)} />
                            </div>
                            <div className="bar-label">{d.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="cat-card">
                      <div className="card-header"><span className="card-title">Gastos por categoría</span></div>
                      {byCategory.length === 0 ? (
                        <div className="empty-mini">Sin gastos este mes</div>
                      ) : (
                        <div className="cat-list">
                          {byCategory.map((c,i) => (
                            <div key={c.cat} className="cat-item">
                              <div className="cat-meta">
                                <span className="cat-dot" style={{ background: catColors[i % catColors.length] }} />
                                <span className="cat-name">{c.cat}</span>
                              </div>
                              <div className="cat-bar-wrap">
                                <div className="cat-bar" style={{ width: `${(c.total / totalGastos) * 100}%`, background: catColors[i % catColors.length] }} />
                              </div>
                              <span className="cat-amount">{formatARS(c.total)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="recent-card">
                    <div className="card-header"><span className="card-title">Últimas transacciones</span></div>
                    <table className="data-table">
                      <thead>
                        <tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th className="col-right">Monto</th></tr>
                      </thead>
                      <tbody>
                        {[
                          ...ingresosF.map(r => ({ ...r, tipo: "ingreso", _fecha: r.fecha })),
                          ...gastosF.map(r   => ({ ...r, tipo: "gasto",   _fecha: r.fecha })),
                          ...ventasF.map(r   => ({ ...r, tipo: "venta",   _fecha: r.created_at?.slice(0,10), monto: r.total })),
                        ]
                          .sort((a,b) => b._fecha?.localeCompare(a._fecha))
                          .slice(0, 8)
                          .map(r => (
                            <tr key={`${r.tipo}-${r.id}`}>
                              <td className="col-date">{formatDate(r._fecha)}</td>
                              <td>{r.descripcion}</td>
                              <td>
                                <span className={`badge ${r.tipo !== "gasto" ? "badge-ing" : "badge-gas"}`}>
                                  {r.tipo === "ingreso" ? "↑ Ingreso" : r.tipo === "venta" ? "🛒 Venta" : "↓ Gasto"}
                                </span>
                              </td>
                              <td className={`col-right amount ${r.tipo !== "gasto" ? "amount-pos" : "amount-neg"}`}>
                                {r.tipo !== "gasto" ? "+" : "-"}{formatARS(r.monto)}
                              </td>
                            </tr>
                          ))}
                        {ingresosF.length === 0 && gastosF.length === 0 && ventasF.length === 0 && (
                          <tr><td colSpan={4} className="empty-row">Sin transacciones este mes</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── VENTAS ── */}
              {tab === "ventas" && (
                <div className="tab-table">
                  <div className="table-summary">
                    <span>Total: <strong>{formatARS(totalVentas)}</strong></span>
                    <span className="summary-count">{ventasF.length} ventas</span>
                  </div>
                  <div className="table-card">
                    <table className="data-table">
                      <thead>
                        <tr><th>Fecha</th><th>Cliente</th><th>Descripción</th><th>Método</th><th>Registrado por</th><th className="col-right">Total</th><th /></tr>
                      </thead>
                      <tbody>
                        {ventasF.length === 0 ? (
                          <tr><td colSpan={7} className="empty-row">Sin ventas este mes.</td></tr>
                        ) : ventasF.map(r => (
                          <tr key={r.id}>
                            <td className="col-date">{formatDate(r.created_at)}</td>
                            <td>{r.cliente}</td>
                            <td>{r.descripcion}</td>
                            <td>
                              <span className="metodo-badge" style={{ background: metodoColors[r.metodo_pago] + "22", color: metodoColors[r.metodo_pago] }}>
                                {r.metodo_pago}
                              </span>
                            </td>
                            <td className="col-notes">{getNombreUsuario(r.usuario_id)}</td>
                            <td className="col-right amount amount-pos">+{formatARS(r.total)}</td>
                            <td className="col-action">
                              <button className="btn-delete" onClick={() => setDeleteConfirm({ table: "ventas", id: r.id, label: r.descripcion })}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── INGRESOS ── */}
              {tab === "ingresos" && (
                <div className="tab-table">
                  <div className="table-summary">
                    <span>Total: <strong>{formatARS(totalIngresos)}</strong></span>
                    <span className="summary-count">{ingresosF.length} registros</span>
                  </div>
                  <div className="table-card">
                    <table className="data-table">
                      <thead>
                        <tr><th>Fecha</th><th>Descripción</th><th>Notas</th><th className="col-right">Monto</th><th /></tr>
                      </thead>
                      <tbody>
                        {ingresosF.length === 0 ? (
                          <tr><td colSpan={5} className="empty-row">Sin ingresos este mes.</td></tr>
                        ) : ingresosF.map(r => (
                          <tr key={r.id}>
                            <td className="col-date">{formatDate(r.fecha)}</td>
                            <td>{r.descripcion}</td>
                            <td className="col-notes">{r.notas ?? "—"}</td>
                            <td className="col-right amount amount-pos">+{formatARS(r.monto)}</td>
                            <td className="col-action">
                              <button className="btn-delete" onClick={() => setDeleteConfirm({ table: "ingresos", id: r.id, label: r.descripcion })}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── GASTOS ── */}
              {tab === "gastos" && (
                <div className="tab-table">
                  <div className="table-summary">
                    <span>Total: <strong>{formatARS(totalGastos)}</strong></span>
                    <span className="summary-count">{gastosF.length} registros</span>
                  </div>
                  <div className="table-card">
                    <table className="data-table">
                      <thead>
                        <tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Notas</th><th className="col-right">Monto</th><th /></tr>
                      </thead>
                      <tbody>
                        {gastosF.length === 0 ? (
                          <tr><td colSpan={6} className="empty-row">Sin gastos este mes.</td></tr>
                        ) : gastosF.map(r => (
                          <tr key={r.id}>
                            <td className="col-date">{formatDate(r.fecha)}</td>
                            <td>{r.descripcion}</td>
                            <td><span className="cat-tag">{r.categoria ?? "—"}</span></td>
                            <td className="col-notes">{r.notas ?? "—"}</td>
                            <td className="col-right amount amount-neg">-{formatARS(r.monto)}</td>
                            <td className="col-action">
                              <button className="btn-delete" onClick={() => setDeleteConfirm({ table: "gastos", id: r.id, label: r.descripcion })}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── STOCK ── */}
              {tab === "stock" && <Stock user={user} />}
            </>
          )}
        </div>
      </main>

      {/* Modal ingreso/gasto */}
      {modalType && (
        <div className="modal-overlay" onClick={() => setModalType(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Nuevo {modalType === "ingreso" ? "ingreso" : "gasto"}</h2>
              <button className="modal-close" onClick={() => setModalType(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label className="field-label">Descripción *</label>
                <input className="field-input" name="descripcion" value={form.descripcion} onChange={handleFormChange} placeholder="Ej: Venta mostrador" autoFocus />
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="field-label">Monto (ARS) *</label>
                  <input className="field-input" name="monto" type="number" min="0" step="0.01" value={form.monto} onChange={handleFormChange} placeholder="0.00" />
                </div>
                <div className="field">
                  <label className="field-label">Fecha *</label>
                  <input className="field-input" name="fecha" type="date" value={form.fecha} onChange={handleFormChange} />
                </div>
              </div>
              {modalType === "gasto" && (
                <div className="field">
                  <label className="field-label">Categoría</label>
                  <select className="field-input" name="categoria" value={form.categoria} onChange={handleFormChange}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              <div className="field">
                <label className="field-label">Notas (opcional)</label>
                <textarea className="field-input field-textarea" name="notas" value={form.notas} onChange={handleFormChange} placeholder="Observaciones..." rows={2} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setModalType(null)} disabled={formLoading}>Cancelar</button>
              <button className="btn-primary" onClick={handleSubmit} disabled={formLoading}>{formLoading ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Eliminar registro</h2>
              <button className="modal-close" onClick={() => setDeleteConfirm(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="confirm-text">¿Eliminás <strong>"{deleteConfirm.label}"</strong>? Esta acción no se puede deshacer.</p>
            </div>
            <div className="modal-footer">
              <button className="btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
              <button className="btn-danger" onClick={handleDelete}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className="toast-icon">{toast.type === "success" ? "✓" : "✕"}</span>
          {toast.msg}
        </div>
      )}
    </div>
  );
}