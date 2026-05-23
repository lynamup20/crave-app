import { useState } from "react";
import { signInWithEmail, signUpWithEmail } from "../services/craveSupabase.js";

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const fn = mode === "signup" ? signUpWithEmail : signInWithEmail;
      const data = await fn(email.trim(), password);
      const user = data.session?.user || data.user;
      if (user) onAuthenticated(user);
      else if (mode === "signup") {
        setError("Check your email to confirm your account, then sign in.");
      }
    } catch (err) {
      setError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: "#0A0A0A", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="phone" style={{ width: "min(390px, 100vw)", padding: "32px 24px", background: "#111", borderRadius: 48, border: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>??</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", letterSpacing: "-1px" }}>
            crave<span style={{ color: "#E8000A" }}>.</span>
          </div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 6, fontWeight: 600 }}>
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 14, fontWeight: 600 }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 14, fontWeight: 600 }}
          />

          {error && (
            <div style={{ color: "#FF6060", fontSize: 12, fontWeight: 700, lineHeight: 1.5, textAlign: "center" }}>
              {error}
            </div>
          )}

          <button type="submit" className="redbtn" disabled={loading} style={{ marginTop: 4, opacity: loading ? 0.7 : 1 }}>
            {loading ? "Please wait..." : mode === "signup" ? "Sign Up" : "Sign In"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); }}
          className="ghostbtn"
          style={{ marginTop: 12 }}
        >
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </div>
    </div>
  );
}
