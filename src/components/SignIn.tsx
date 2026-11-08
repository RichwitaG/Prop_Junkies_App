import { useState, type FormEvent } from "react";
import { useStore } from "../store";
import { Link } from "./common";

export function SignIn() {
  const { myId, actions } = useStore();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  if (myId) {
    return (
      <div className="card">
        <h2>You're signed in</h2>
        <Link to={`/u/${myId}`} className="btn btn-primary btn-block">Go to your profile</Link>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    if (await actions.signIn(email.trim())) setSentTo(email.trim());
    setBusy(false);
  };

  if (sentTo) {
    return (
      <div className="card prose">
        <h2>Check your email 📬</h2>
        <p>
          We sent a sign-in link to <strong>{sentTo}</strong>. Tap it to finish signing in — no password needed.
        </p>
        <p className="muted small">
          Open the link on this device. Nothing after a few minutes? Check spam, then try again.
        </p>
        <button className="btn btn-ghost btn-block" onClick={() => setSentTo(null)}>
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Sign in or join</h2>
      <p className="muted">Enter your email and we'll send you a link. New here? The same link creates your account.</p>
      <label>
        Email
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </label>
      <button className="btn btn-primary btn-block" disabled={!valid || busy}>
        {busy ? "Sending…" : "Email me a sign-in link"}
      </button>
      <p className="muted small">21+ only. Prop Junkies is a community, not a sportsbook — we never take bets.</p>
    </form>
  );
}
