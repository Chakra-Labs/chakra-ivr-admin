"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setLoginError(body.error ?? "Sign-in failed.");
    } catch {
      setLoginError("Cannot reach the server.");
    }
    setLoading(false);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center font-sans relative overflow-hidden z-0 bg-cover bg-center"
      style={{ backgroundImage: "url('/blue-wave-black.jpg')" }}
    >
      <div className="absolute inset-0 bg-black/40 -z-10" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-500/[0.15] rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-[#00ebfb]/[0.1] rounded-full blur-[120px] pointer-events-none -z-10" />

      <div className="w-full max-w-[420px] p-8 relative z-10">
        <div className="flex justify-center mb-10">
          <Image src="/chakra-labs-logo.png" alt="Chakra Labs" width={220} height={64} className="w-auto h-16 object-contain drop-shadow-2xl" priority />
        </div>

        <div className="bg-[#0f0e13]/80 backdrop-blur-md border border-white/5 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-[#00ebfb] to-indigo-500" />

          <h2 className="text-2xl font-bold text-white mb-2 text-center">Sign in to Chakra Console</h2>
          <p className="text-zinc-500 text-[13px] text-center mb-8">Enter your admin credentials to access the hub.</p>

          {loginError && (
            <div className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[13px] text-center font-medium">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-[12px] font-medium text-zinc-400 ml-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                className="w-full px-4 py-3 bg-[#15141a] border border-white/5 rounded-xl focus:outline-none focus:border-[#00ebfb]/50 text-white text-[14px] transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[12px] font-medium text-zinc-400 ml-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-[#15141a] border border-white/5 rounded-xl focus:outline-none focus:border-[#00ebfb]/50 text-white text-[14px] transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 mt-4 bg-[#00ebfb] text-black hover:bg-[#00ebfb]/90 rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(0,235,251,0.2)] text-[14px] flex justify-center items-center gap-2 disabled:opacity-50"
            >
              {loading ? "Authenticating..." : "Sign In to Admin Hub"}
            </button>
          </form>
        </div>

        <p className="text-center text-zinc-600 text-[11px] mt-8 font-medium tracking-wide">
          SECURE ACCESS • CHAKRA CONSOLE
        </p>
      </div>
    </div>
  );
}
