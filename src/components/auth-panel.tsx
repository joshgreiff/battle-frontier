"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AuthPanel() {
  const router = useRouter();
  const [registerData, setRegisterData] = useState({
    email: "",
    password: "",
    displayName: ""
  });
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [message, setMessage] = useState<string>("");
  const [fieldMessage, setFieldMessage] = useState<string>("");

  async function registerUser(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setFieldMessage("");
    const payload = {
      email: registerData.email.trim().toLowerCase(),
      password: registerData.password,
      displayName: registerData.displayName.trim() || undefined
    };
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const data = (await res.json()) as {
        error?: string;
        details?: { fieldErrors?: Record<string, string[] | undefined> };
      };
      const passwordError = data.details?.fieldErrors?.password?.[0];
      const emailError = data.details?.fieldErrors?.email?.[0];
      const displayNameError = data.details?.fieldErrors?.displayName?.[0];
      setFieldMessage(passwordError ?? emailError ?? displayNameError ?? "");
      setMessage(data.error ?? "Unable to sign up.");
      return;
    }
    await signIn("credentials", {
      email: payload.email,
      password: registerData.password,
      redirect: false
    });
    router.refresh();
  }

  async function loginUser(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setFieldMessage("");
    const result = await signIn("credentials", {
      email: loginData.email,
      password: loginData.password,
      redirect: false
    });
    if (result?.error) {
      setMessage("Invalid login credentials.");
      return;
    }
    router.refresh();
  }

  return (
    <main className="container stack">
      <section className="card heroCard">
        <h1 className="title">Battle Frontier</h1>
        <p className="muted">
          Sign in to create or join your testing group with invite code +
          password.
        </p>
      </section>

      <section className="card splitCards">
        <form className="stack" onSubmit={registerUser}>
          <h2>Create Account</h2>
          <input
            placeholder="Display name"
            value={registerData.displayName}
            onChange={(e) =>
              setRegisterData((v) => ({ ...v, displayName: e.target.value }))
            }
          />
          <input
            required
            type="email"
            placeholder="Email"
            value={registerData.email}
            onChange={(e) => setRegisterData((v) => ({ ...v, email: e.target.value }))}
          />
          <input
            required
            type="password"
            placeholder="Password"
            minLength={8}
            value={registerData.password}
            onChange={(e) =>
              setRegisterData((v) => ({ ...v, password: e.target.value }))
            }
          />
          <p className="mutedText">Password must be at least 8 characters.</p>
          <button className="actionBtn" type="submit">
            Sign Up
          </button>
        </form>

        <form className="stack" onSubmit={loginUser}>
          <h2>Sign In</h2>
          <input
            required
            type="email"
            placeholder="Email"
            value={loginData.email}
            onChange={(e) => setLoginData((v) => ({ ...v, email: e.target.value }))}
          />
          <input
            required
            type="password"
            placeholder="Password"
            value={loginData.password}
            onChange={(e) => setLoginData((v) => ({ ...v, password: e.target.value }))}
          />
          <button className="actionBtn" type="submit">
            Sign In
          </button>
        </form>
      </section>

      {message && (
        <section className="card">
          <p className="muted">{message}</p>
          {fieldMessage ? <p className="mutedText">{fieldMessage}</p> : null}
        </section>
      )}
    </main>
  );
}
