// src/App.jsx
import { useEffect, useState } from "react";
import { supabase } from "./services/supabase";
import Login     from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Empleado  from "./pages/Empleado";

export default function App() {
  const [session, setSession] = useState(undefined);
  const [rol, setRol]         = useState(null);

  useEffect(() => {
    const init = async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      setSession(s ?? null);
      if (s?.user) {
        const { data } = await supabase.from("usuarios").select("rol").eq("id", s.user.id).single();
        setRol(data?.rol ?? null);
      }
    };
    init();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s ?? null);
      if (s?.user) {
        const { data } = await supabase.from("usuarios").select("rol").eq("id", s.user.id).single();
        setRol(data?.rol ?? null);
      } else {
        setRol(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === undefined || (session && rol === null)) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f2f5" }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!session) return <Login />;
  if (rol === "empleado") return <Empleado />;
  return <Dashboard />;
}