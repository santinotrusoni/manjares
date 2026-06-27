// src/pages/Login.jsx
import { useState } from "react";
import { supabase } from "../services/supabase";

export default function Login() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  const handleLogin = async () => {
    if (!email.trim() || !password) { setError("Completá email y contraseña."); return; }
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (err) { setError("Credenciales incorrectas. Verificá e intentá de nuevo."); return; }
    window.location.reload();
  };

  const handleKey = (e) => { if (e.key === "Enter") handleLogin(); };

  return (
    <div className="login-root">
      {/* Left panel */}
      <div className="login-left">
        <div className="login-brand">
          <span className="login-brand-icon">🍬</span>
          <span className="login-brand-name">Manjares</span>
          <span className="login-brand-sub">Sistema de gestión financiera</span>
        </div>
        <div className="login-stats">
          <div className="login-stat">
            <div className="login-stat-label">Control de ingresos</div>
            <div className="login-stat-value">Ventas diarias</div>
          </div>
          <div className="login-stat">
            <div className="login-stat-label">Gestión de gastos</div>
            <div className="login-stat-value">Por categoría</div>
          </div>
          <div className="login-stat">
            <div className="login-stat-label">Balance en tiempo real</div>
            <div className="login-stat-value">Rentabilidad</div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="login-right">
        <div className="login-box">
          <h1 className="login-heading">Bienvenido de nuevo</h1>
          <p className="login-sub">Ingresá tus credenciales para acceder al panel.</p>

          <div className="login-form">
            {error && <div className="login-error">{error}</div>}

            <div className="field">
              <label className="field-label">Email</label>
              <input
                className="field-input"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={handleKey}
                autoFocus
                autoComplete="email"
              />
            </div>

            <div className="field">
              <label className="field-label">Contraseña</label>
              <input
                className="field-input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={handleKey}
                autoComplete="current-password"
              />
            </div>

            <button className="btn-login" onClick={handleLogin} disabled={loading}>
              {loading ? "Ingresando..." : "Ingresar"}
            </button>
          </div>

          <p className="login-footer">
            Acceso restringido al equipo de Manjares.<br />
            Si no tenés cuenta, contactá al administrador.
          </p>
        </div>
      </div>
    </div>
  );
}