// src/pages/Empleado.jsx
import { useState, useEffect, useRef } from "react";
import { supabase } from "../services/supabase";

const METODOS = ["Efectivo", "Mercado Pago", "Débito", "Crédito"];

function formatARS(n) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n ?? 0);
}
function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const EMPTY_ITEM = { producto_id: null, descripcion: "", cantidad: 1, precio_unitario: "", subtotal: 0 };

export default function Empleado() {
  const [user, setUser]         = useState(null);
  const [perfil, setPerfil]     = useState(null);
  const [productos, setProductos] = useState([]);
  const [ventas, setVentas]     = useState([]);
  const [fetching, setFetching] = useState(true);
  const [toast, setToast]       = useState(null);
  const [loading, setLoading]   = useState(false);

  // Form venta
  const [cliente, setCliente]     = useState("");
  const [metodo, setMetodo]       = useState("Efectivo");
  const [items, setItems]         = useState([{ ...EMPTY_ITEM }]);
  const [busqueda, setBusqueda]   = useState([]); // per-item search string
  const [dropdown, setDropdown]   = useState([]); // per-item dropdown open
  const dropdownRef               = useRef([]);

  const metodoColors = { "Efectivo": "#10b981", "Mercado Pago": "#6366f1", "Débito": "#f59e0b", "Crédito": "#ef4444" };

  useEffect(() => {
    const init = async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      setUser(u);
      if (!u) return;
      const [{ data: p }, { data: prods }, { data: v }] = await Promise.all([
        supabase.from("usuarios").select("*").eq("id", u.id).single(),
        supabase.from("productos").select("*").eq("activo", true).order("nombre"),
        supabase.from("ventas").select("*, venta_items(*)").eq("usuario_id", u.id)
          .gte("created_at", new Date().toISOString().slice(0,10) + "T00:00:00")
          .order("created_at", { ascending: false }),
      ]);
      setPerfil(p);
      setProductos(prods ?? []);
      setVentas(v ?? []);
      setFetching(false);
      setBusqueda(Array(1).fill(""));
      setDropdown(Array(1).fill(false));
    };
    init();
  }, []);

  // Cerrar dropdowns al clickear afuera
  useEffect(() => {
    const handler = (e) => {
      if (!dropdownRef.current.some(r => r && r.contains(e.target))) {
        setDropdown(d => d.map(() => false));
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  // ── Item handlers ──────────────────────────────────────────────
  const addItem = () => {
    setItems(prev => [...prev, { ...EMPTY_ITEM }]);
    setBusqueda(prev => [...prev, ""]);
    setDropdown(prev => [...prev, false]);
  };

  const removeItem = (i) => {
    if (items.length === 1) return;
    setItems(prev => prev.filter((_,idx) => idx !== i));
    setBusqueda(prev => prev.filter((_,idx) => idx !== i));
    setDropdown(prev => prev.filter((_,idx) => idx !== i));
  };

  const updateItem = (i, field, value) => {
    setItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      const p = parseFloat(next[i].precio_unitario) || 0;
      const q = parseFloat(next[i].cantidad) || 0;
      next[i].subtotal = p * q;
      return next;
    });
  };

  const selectProducto = (i, prod) => {
    setItems(prev => {
      const next = [...prev];
      next[i] = {
        producto_id:    prod.id,
        descripcion:    prod.nombre,
        cantidad:       1,
        precio_unitario: prod.precio,
        subtotal:       prod.precio,
      };
      return next;
    });
    setBusqueda(prev => { const n = [...prev]; n[i] = prod.nombre; return n; });
    setDropdown(prev => { const n = [...prev]; n[i] = false; return n; });
  };

  const clearProducto = (i) => {
    setItems(prev => { const n = [...prev]; n[i] = { ...EMPTY_ITEM }; return n; });
    setBusqueda(prev => { const n = [...prev]; n[i] = ""; return n; });
  };

  const filteredProds = (i) => {
    const q = busqueda[i]?.toLowerCase() ?? "";
    return productos.filter(p => p.nombre.toLowerCase().includes(q));
  };

  const total = items.reduce((s, it) => s + (it.subtotal || 0), 0);

  // ── Submit ─────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!cliente.trim()) { showToast("Ingresá el nombre del cliente.", "error"); return; }
    if (items.some(it => !it.descripcion.trim())) { showToast("Completá la descripción de todos los ítems.", "error"); return; }
    if (items.some(it => !it.precio_unitario || Number(it.precio_unitario) <= 0)) { showToast("Todos los ítems deben tener precio.", "error"); return; }
    if (total <= 0) { showToast("El total debe ser mayor a cero.", "error"); return; }

    // Verificar stock
    for (const it of items) {
      if (it.producto_id) {
        const prod = productos.find(p => p.id === it.producto_id);
        if (prod && prod.stock_actual < it.cantidad) {
          showToast(`Stock insuficiente de "${prod.nombre}". Disponible: ${prod.stock_actual} ${prod.unidad}.`, "error");
          return;
        }
      }
    }

    setLoading(true);

    // 1. Crear venta
    const { data: venta, error: ventaErr } = await supabase
      .from("ventas")
      .insert([{ cliente: cliente.trim(), descripcion: items.map(i => i.descripcion).join(", "), metodo_pago: metodo, total, usuario_id: user?.id }])
      .select()
      .single();

    if (ventaErr) { setLoading(false); showToast("Error al registrar la venta.", "error"); return; }

    // 2. Insertar venta_items
    const ventaItems = items.map(it => ({
      venta_id:        venta.id,
      producto_id:     it.producto_id ?? null,
      descripcion:     it.descripcion,
      cantidad:        parseFloat(it.cantidad),
      precio_unitario: parseFloat(it.precio_unitario),
      subtotal:        it.subtotal,
    }));
    await supabase.from("venta_items").insert(ventaItems);

    // 3. Descontar stock + registrar movimiento por cada ítem con producto
    for (const it of items.filter(i => i.producto_id)) {
      const prod = productos.find(p => p.id === it.producto_id);
      if (!prod) continue;
      const nuevoStock = prod.stock_actual - parseFloat(it.cantidad);
      await supabase.from("productos").update({ stock_actual: nuevoStock }).eq("id", it.producto_id);
      await supabase.from("stock_movimientos").insert([{
        producto_id: it.producto_id,
        tipo:        "salida",
        cantidad:    parseFloat(it.cantidad),
        motivo:      `Venta #${venta.id} — ${cliente}`,
        venta_id:    venta.id,
        usuario_id:  user?.id,
      }]);
    }

    // 4. Refrescar productos y ventas
    const [{ data: prodsNew }, { data: ventasNew }] = await Promise.all([
      supabase.from("productos").select("*").eq("activo", true).order("nombre"),
      supabase.from("ventas").select("*, venta_items(*)").eq("usuario_id", user?.id)
        .gte("created_at", new Date().toISOString().slice(0,10) + "T00:00:00")
        .order("created_at", { ascending: false }),
    ]);
    setProductos(prodsNew ?? []);
    setVentas(ventasNew ?? []);

    setLoading(false);
    setCliente("");
    setMetodo("Efectivo");
    setItems([{ ...EMPTY_ITEM }]);
    setBusqueda([""]);
    setDropdown([false]);
    showToast("Venta registrada.");
  };

  const totalHoy = ventas.reduce((s, v) => s + (v.total ?? 0), 0);

  return (
    <div className="emp-root">
      <header className="emp-header">
        <div className="emp-header-left">
          <span className="brand-icon">🍬</span>
          <span className="emp-brand">Manjares</span>
        </div>
        <div className="emp-header-right">
          <div className="emp-user-info">
            <span className="emp-username">{perfil ? `${perfil.nombre} ${perfil.apellido}` : user?.email}</span>
            <span className="emp-role-badge">Empleado</span>
          </div>
          <button className="btn-logout-emp" onClick={handleLogout}>Salir</button>
        </div>
      </header>

      <div className="emp-body">

        {/* Form */}
        <div className="emp-form-col">
          <div className="emp-form-card">
            <div className="emp-form-title">Registrar venta</div>
            <div className="emp-form-body">

              <div className="field">
                <label className="field-label">Cliente *</label>
                <input className="field-input" value={cliente} onChange={e => setCliente(e.target.value)} placeholder="Nombre del cliente" autoFocus />
              </div>

              <div className="field">
                <label className="field-label">Método de pago *</label>
                <div className="metodo-grid">
                  {METODOS.map(m => (
                    <button
                      key={m}
                      className={`metodo-btn${metodo === m ? " selected" : ""}`}
                      style={metodo === m ? { borderColor: metodoColors[m], background: metodoColors[m] + "18", color: metodoColors[m] } : {}}
                      onClick={() => setMetodo(m)}
                    >
                      <span className="metodo-btn-dot" style={{ background: metodoColors[m] }} />{m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Items */}
              <div className="field">
                <label className="field-label">Productos / Ítems *</label>
                <div className="items-list">
                  {items.map((it, i) => (
                    <div key={i} className="item-row">
                      <div className="item-row-top">
                        {/* Buscador de producto */}
                        <div className="item-search-wrap" ref={el => dropdownRef.current[i] = el}>
                          <input
                            className="field-input item-search-input"
                            placeholder="Buscar producto o escribir..."
                            value={busqueda[i] ?? ""}
                            onChange={e => {
                              const v = e.target.value;
                              setBusqueda(prev => { const n=[...prev]; n[i]=v; return n; });
                              updateItem(i, "descripcion", v);
                              if (it.producto_id) clearProducto(i);
                              setDropdown(prev => { const n=[...prev]; n[i]=v.length>0; return n; });
                            }}
                            onFocus={() => setDropdown(prev => { const n=[...prev]; n[i]=true; return n; })}
                          />
                          {it.producto_id && (
                            <button className="item-clear-btn" onClick={() => clearProducto(i)} title="Quitar producto">✕</button>
                          )}
                          {dropdown[i] && filteredProds(i).length > 0 && (
                            <div className="prod-dropdown">
                              {filteredProds(i).map(p => (
                                <button
                                  key={p.id}
                                  className="prod-option"
                                  onMouseDown={() => selectProducto(i, p)}
                                >
                                  <div className="prod-option-left">
                                    <span className="prod-option-name">{p.nombre}</span>
                                    {p.stock_actual <= p.stock_minimo && (
                                      <span className="prod-stock-warn">⚠ Stock bajo</span>
                                    )}
                                  </div>
                                  <div className="prod-option-right">
                                    <span className="prod-option-stock">{p.stock_actual} {p.unidad}</span>
                                    <span className="prod-option-price">{formatARS(p.precio)}</span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Cantidad */}
                        <input
                          className="field-input item-qty"
                          type="number" min="0.5" step="0.5"
                          value={it.cantidad}
                          onChange={e => updateItem(i, "cantidad", e.target.value)}
                          placeholder="Cant."
                        />

                        {/* Precio */}
                        <div className="monto-wrap item-price">
                          <span className="monto-prefix">$</span>
                          <input
                            className="field-input monto-input"
                            type="number" min="0" step="0.01"
                            value={it.precio_unitario}
                            onChange={e => updateItem(i, "precio_unitario", e.target.value)}
                            placeholder="Precio"
                          />
                        </div>

                        {/* Quitar */}
                        {items.length > 1 && (
                          <button className="btn-delete item-remove" onClick={() => removeItem(i)}>✕</button>
                        )}
                      </div>

                      {it.subtotal > 0 && (
                        <div className="item-subtotal">Subtotal: <strong>{formatARS(it.subtotal)}</strong></div>
                      )}
                    </div>
                  ))}
                </div>
                <button className="btn-add-item" onClick={addItem}>+ Agregar ítem</button>
              </div>

              {/* Total */}
              <div className="venta-total-row">
                <span className="venta-total-label">Total</span>
                <span className="venta-total-value">{formatARS(total)}</span>
              </div>

              <button className="btn-registrar" onClick={handleSubmit} disabled={loading}>
                {loading ? "Registrando..." : "Registrar venta"}
              </button>
            </div>
          </div>
        </div>

        {/* Ventas del día */}
        <div className="emp-list-col">
          <div className="emp-day-header">
            <div>
              <div className="emp-day-title">Mis ventas de hoy</div>
              <div className="emp-day-date">{new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}</div>
            </div>
            <div className="emp-day-total">
              <div className="emp-day-total-label">Total del día</div>
              <div className="emp-day-total-value">{formatARS(totalHoy)}</div>
            </div>
          </div>

          {fetching ? (
            <div className="loading-state"><div className="spinner" /></div>
          ) : ventas.length === 0 ? (
            <div className="emp-empty">
              <span className="emp-empty-icon">🛒</span>
              <span>Todavía no registraste ventas hoy.</span>
            </div>
          ) : (
            <div className="emp-ventas-list">
              {ventas.map(v => (
                <div key={v.id} className="emp-venta-item">
                  <div className="emp-venta-left">
                    <div className="emp-venta-desc">{v.descripcion}</div>
                    <div className="emp-venta-meta">
                      <span className="emp-venta-cliente">{v.cliente}</span>
                      <span className="emp-venta-sep">·</span>
                      <span className="emp-venta-hora">{formatDate(v.created_at)}</span>
                    </div>
                    {v.venta_items?.length > 0 && (
                      <div className="emp-venta-items-detail">
                        {v.venta_items.map((it, idx) => (
                          <span key={idx} className="emp-item-chip">
                            {it.cantidad > 1 ? `${it.cantidad}× ` : ""}{it.descripcion}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="emp-venta-right">
                    <span className="metodo-badge-sm" style={{ background: metodoColors[v.metodo_pago] + "22", color: metodoColors[v.metodo_pago] }}>
                      {v.metodo_pago}
                    </span>
                    <span className="emp-venta-total">{formatARS(v.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className="toast-icon">{toast.type === "success" ? "✓" : "✕"}</span>
          {toast.msg}
        </div>
      )}
    </div>
  );
}