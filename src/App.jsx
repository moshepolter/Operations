import React, { useState, useEffect, useRef } from "react";
import {
  Plus, X, Check, HelpCircle, AlertTriangle, MessageCircle,
  Trash2, ChevronDown, ChevronUp, Copy, FileText, Wrench, ShieldAlert,
  CheckCircle2, Loader2, Building2, Users, User, Camera, Pencil, Printer
} from "lucide-react";
import { doc, collection, onSnapshot, setDoc, getDoc, deleteDoc, runTransaction } from "firebase/firestore";
import { signInAnonymously, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { db, auth } from "./firebase";

const C = {
  ink: "#1B2430",
  paper: "#F7F5F0",
  paperDark: "#EFEADF",
  card: "#FFFDF8",
  slate: "#3D5A73",
  amber: "#C98A2C",
  amberBg: "#FBF0DD",
  red: "#B3392F",
  redBg: "#FBE7E4",
  green: "#4C7A52",
  greenBg: "#E7F0E5",
  hair: "#DCD5C6",
  muted: "#8A8371",
};

function useFonts() {
  useEffect(() => {
    const id = "ops-board-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }, []);
}

const ABECO_LOGO = "https://abecomanagement.com/wp-content/uploads/2016/01/AbeCo_LogoNEW.png";
function Logo({ height = 30 }) {
  return <img src={ABECO_LOGO} alt="Abeco Management" style={{ height, width: "auto" }} />;
}

function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtShortDate(d) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" });
}
function daysBetween(a, b) {
  const A = new Date(a + "T00:00:00");
  const B = new Date(b + "T00:00:00");
  return Math.round((B - A) / 86400000);
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

const SEED_CONTRACTORS = ["Dexter", "David Williams", "Joel Williams", "Joseph Shemtove"].map((name) => ({
  id: uid(), name, phone: "", email: "",
}));

// Signs everyone in anonymously (no login screen) so both you and your boss
// can open the link and read/write the same live data in Firestore.
function useAnonAuth() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) setReady(true);
      else signInAnonymously(auth).catch((e) => console.error("Anonymous sign-in failed:", e));
    });
    return unsub;
  }, []);
  return ready;
}

// For your dashboard only: checks for a REAL signed-in user (email/password),
// not an anonymous one. Doesn't sign anyone in automatically — if nobody's
// logged in, the app shows the login screen instead.
function useRealAuth() {
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u && !u.isAnonymous ? u : null);
      setChecked(true);
    });
    return unsub;
  }, []);
  return { user, checked };
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error("Sign-in failed:", err.code, err.message);
      // Only show the generic "wrong credentials" message for that specific
      // case — anything else (network issue, rate limiting, etc.) shows the
      // real reason instead of masking it, so this is easier to debug.
      if (err.code === "auth/wrong-password" || err.code === "auth/user-not-found" || err.code === "auth/invalid-credential") {
        setError("Incorrect email or password.");
      } else if (err.code === "auth/too-many-requests") {
        setError("Too many attempts — wait a few minutes and try again.");
      } else {
        setError(`Sign-in error: ${err.code || err.message}`);
      }
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5" style={{ backgroundColor: C.paper, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <form onSubmit={submit} className="w-full max-w-sm p-6 rounded-lg border" style={{ borderColor: C.hair, backgroundColor: C.card }}>
        <div className="mb-3"><Logo height={24} /></div>
        <div className="text-xs uppercase tracking-widest font-semibold mb-1" style={{ color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>Abeco Management</div>
        <h1 className="text-xl font-bold mb-4" style={{ color: C.ink }}>Sign in</h1>
        <div className="flex flex-col gap-3">
          <Field label="Email">
            <input type="text" inputMode="email" autoComplete="email" autoCapitalize="off" autoCorrect="off" required className={inputCls} style={inputStyle()} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <input type="password" required className={inputCls} style={inputStyle()} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <div className="text-sm" style={{ color: C.red }}>{error}</div>}
          <Btn type="submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</Btn>
        </div>
      </form>
    </div>
  );
}

/* ---------------- QUICK UNLOCK: PIN + FACE ID ---------------- */
// This is a convenience lock layered on top of the real Firebase login
// above — it never replaces it. Your email/password is still what actually
// protects your data; this just avoids retyping it every time.
//
// The PIN itself is stored centrally in Firestore (as a one-way hash, never
// the PIN itself), so the SAME PIN works on any browser or device once
// you're logged in there — not something you set up separately per device.
// Face ID/Touch ID can't work that way — it's physically tied to one
// device's sensor — so that part is still set up separately on each device
// you want to use it on, with the shared PIN as the fallback everywhere.

const WEBAUTHN_ID_KEY = "abeco_webauthn_id";

async function hashPin(pin) {
  const data = new TextEncoder().encode(pin);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getAdminPinHash() {
  try {
    const snap = await getDoc(doc(db, "settings", "adminPin"));
    return snap.exists() ? snap.data().hash : null;
  } catch (e) {
    console.error("Failed to read admin PIN:", e);
    return null;
  }
}
async function setAdminPinHash(hash) {
  await setDoc(doc(db, "settings", "adminPin"), { hash });
}
async function clearAdminPinHash() {
  await deleteDoc(doc(db, "settings", "adminPin"));
}

function hasFaceIdSet() { return !!localStorage.getItem(WEBAUTHN_ID_KEY); }
function faceIdSupported() { return typeof window !== "undefined" && !!window.PublicKeyCredential; }

async function registerFaceId() {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Abeco Management" },
      user: { id: userId, name: "abeco-ops", displayName: "Abeco Ops" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
      timeout: 60000,
    },
  });
  const idBytes = new Uint8Array(credential.rawId);
  const idBase64 = btoa(String.fromCharCode(...idBytes));
  localStorage.setItem(WEBAUTHN_ID_KEY, idBase64);
}

async function verifyFaceId() {
  const storedId = localStorage.getItem(WEBAUTHN_ID_KEY);
  if (!storedId || !faceIdSupported()) return false;
  const idBytes = Uint8Array.from(atob(storedId), (c) => c.charCodeAt(0));
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  try {
    await navigator.credentials.get({
      publicKey: { challenge, allowCredentials: [{ id: idBytes, type: "public-key" }], userVerification: "required", timeout: 60000 },
    });
    return true;
  } catch (e) {
    return false;
  }
}

function LockScreen({ pinHash, onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const faceIdReady = hasFaceIdSet() && faceIdSupported();

  const tryFaceId = async () => {
    setChecking(true); setError("");
    const ok = await verifyFaceId();
    setChecking(false);
    if (ok) onUnlock();
    else setError("Face ID didn't work — enter your PIN instead.");
  };

  const submitPin = async (e) => {
    e.preventDefault();
    const hash = await hashPin(pin);
    if (hash === pinHash) {
      onUnlock();
    } else {
      setError("Wrong PIN.");
      setPin("");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5" style={{ backgroundColor: C.paper, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <form onSubmit={submitPin} className="w-full max-w-sm p-6 rounded-lg border text-center" style={{ borderColor: C.hair, backgroundColor: C.card }}>
        <div className="mb-3 flex justify-center"><Logo height={24} /></div>
        <h1 className="text-lg font-bold mb-4" style={{ color: C.ink }}>Enter PIN to unlock</h1>
        <input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={8} autoComplete="off" value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className={inputCls} style={{ ...inputStyle(), textAlign: "center", fontSize: 22, letterSpacing: 6, WebkitTextSecurity: "disc" }} />
        {error && <div className="text-sm mt-2" style={{ color: C.red }}>{error}</div>}
        <div className="flex flex-col gap-2 mt-4">
          <Btn type="submit">Unlock</Btn>
          {faceIdReady && <Btn type="button" tone="ghost" disabled={checking} onClick={tryFaceId}>{checking ? "Checking..." : "Use Face ID instead"}</Btn>}
        </div>
      </form>
    </div>
  );
}

function QuickUnlockSetup({ onClose, onChanged }) {
  const [step, setStep] = useState("menu");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [pinSet, setPinSet] = useState(null); // null = checking
  const [faceIdSet, setFaceIdSet] = useState(hasFaceIdSet());

  useEffect(() => { getAdminPinHash().then((h) => setPinSet(!!h)); }, []);

  const savePin = async (e) => {
    e.preventDefault();
    if (pin.length < 4) { setError("PIN needs to be at least 4 digits."); return; }
    if (pin !== confirmPin) { setError("PINs don't match — try again."); return; }
    await setAdminPinHash(await hashPin(pin));
    setPinSet(true); setPin(""); setConfirmPin(""); setError(""); setStep("menu");
    if (onChanged) onChanged();
  };

  const removePin = async () => {
    await clearAdminPinHash();
    localStorage.removeItem(WEBAUTHN_ID_KEY);
    setPinSet(false); setFaceIdSet(false);
    if (onChanged) onChanged();
  };

  const setupFaceId = async () => {
    setError("");
    try {
      await registerFaceId();
      setFaceIdSet(true);
    } catch (e) {
      setError("Face ID setup didn't complete — your phone may not support it, or you cancelled.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-sm p-5 rounded-lg border" style={{ borderColor: C.hair, backgroundColor: C.card }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold" style={{ color: C.ink }}>Quick Unlock</h2>
          <button onClick={onClose} style={{ color: C.muted }}><X size={18} /></button>
        </div>

        {step === "menu" && (
          <div className="flex flex-col gap-2">
            <div className="text-sm" style={{ color: C.muted }}>
              {pinSet === null ? "Checking..." : pinSet
                ? "A PIN is set — it works on any browser or device you log into, not just this one."
                : "No PIN set yet — set one so you can skip retyping your password."}
            </div>
            <Btn onClick={() => setStep("pin")}>{pinSet ? "Change PIN" : "Set a PIN"}</Btn>
            {pinSet && !faceIdSet && faceIdSupported() && <Btn tone="ghost" onClick={setupFaceId}>Enable Face ID / Touch ID on this device</Btn>}
            {faceIdSet && <div className="text-sm" style={{ color: C.green }}>Face ID is enabled on this device.</div>}
            {pinSet && <Btn tone="ghost" onClick={removePin}>Turn off Quick Unlock</Btn>}
            {error && <div className="text-sm" style={{ color: C.red }}>{error}</div>}
          </div>
        )}

        {step === "pin" && (
          <form onSubmit={savePin} className="flex flex-col gap-2">
            <Field label="New PIN (4-8 digits)">
              <input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={8} className={inputCls} style={{ ...inputStyle(), WebkitTextSecurity: "disc" }}
                value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="Confirm PIN">
              <input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={8} className={inputCls} style={{ ...inputStyle(), WebkitTextSecurity: "disc" }}
                value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))} />
            </Field>
            {error && <div className="text-sm" style={{ color: C.red }}>{error}</div>}
            <div className="flex gap-2 justify-end mt-1">
              <Btn type="button" tone="ghost" onClick={() => { setStep("menu"); setError(""); }}>Back</Btn>
              <Btn type="submit">Save PIN</Btn>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function BossPinSettings({ onClose }) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [hasExisting, setHasExisting] = useState(null); // null = checking

  useEffect(() => { getBossPinHash().then((h) => setHasExisting(!!h)); }, []);

  const save = async (e) => {
    e.preventDefault();
    if (pin.length < 4) { setError("PIN needs to be at least 4 digits."); return; }
    if (pin !== confirmPin) { setError("PINs don't match — try again."); return; }
    await setBossPinHash(await hashPin(pin));
    setSaved(true); setError(""); setHasExisting(true);
    setPin(""); setConfirmPin("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-sm p-5 rounded-lg border" style={{ borderColor: C.hair, backgroundColor: C.card }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold" style={{ color: C.ink }}>Boss's PIN</h2>
          <button onClick={onClose} style={{ color: C.muted }}><X size={18} /></button>
        </div>
        <div className="text-sm mb-3" style={{ color: C.muted }}>
          {hasExisting === null ? "Checking..." : hasExisting
            ? "A PIN is already set for the /boss link — set a new one below to change it."
            : "No PIN set yet — your boss can't get into the invoice page until you set one."}
        </div>
        <form onSubmit={save} className="flex flex-col gap-2">
          <Field label="PIN (4-8 digits)">
            <input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={8} className={inputCls} style={{ ...inputStyle(), WebkitTextSecurity: "disc" }}
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Confirm PIN">
            <input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={8} className={inputCls} style={{ ...inputStyle(), WebkitTextSecurity: "disc" }}
              value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))} />
          </Field>
          {error && <div className="text-sm" style={{ color: C.red }}>{error}</div>}
          {saved && <div className="text-sm" style={{ color: C.green }}>Saved — tell your boss this PIN separately from the link.</div>}
          <Btn type="submit">Save PIN</Btn>
        </form>
      </div>
    </div>
  );
}

// Keeps one array (invoices, buildings, etc.) live-synced with a single
// Firestore document. Every browser with this hook open updates in real
// time — that's what makes your Boss View update without a refresh.
function useSynced(key, authReady, seed = []) {
  const [data, setData] = useState(seed);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    const ref = doc(db, "board", key);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        setData(snap.data().items || []);
      } else {
        setDoc(ref, { items: seed }).catch((e) => console.error(e));
        setData(seed);
      }
      setReady(true);
    }, (err) => { console.error(`Sync error on ${key}:`, err); setReady(true); });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, key]);

  const persist = async (next) => {
    setData(next); // update the screen immediately
    try { await setDoc(doc(db, "board", key), { items: next }); }
    catch (e) { console.error(`Save failed on ${key}:`, e); }
  };

  return [data, persist, ready];
}

// Like useSynced, but for invoices and work orders: each one gets its OWN
// Firestore document instead of sharing one big array. This matters because
// photos are stored as data directly in the document, and Firestore caps
// every document at 1MB — one shared doc for everything would fill up fast
// and break saving for every invoice at once. Individual documents mean
// each invoice/work order has its own 1MB of room.
function useCollectionSynced(collectionName, authReady) {
  const [data, setData] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!authReady) return;
    const colRef = collection(db, collectionName);
    const unsub = onSnapshot(colRef, (snap) => {
      setData(snap.docs.map((d) => d.data()));
      setReady(true);
    }, (err) => { console.error(`Sync error on ${collectionName}:`, err); setReady(true); });
    return unsub;
  }, [authReady, collectionName]);

  const saveItem = async (item) => {
    setData((prev) => (prev.some((x) => x.id === item.id) ? prev.map((x) => (x.id === item.id ? item : x)) : [item, ...prev]));
    try { await setDoc(doc(db, collectionName, item.id), item); }
    catch (e) { console.error(`Save failed on ${collectionName}:`, e); }
  };
  const deleteItem = async (id) => {
    setData((prev) => prev.filter((x) => x.id !== id));
    try { await deleteDoc(doc(db, collectionName, id)); }
    catch (e) { console.error(`Delete failed on ${collectionName}:`, e); }
  };

  return [data, saveItem, deleteItem, ready];
}

// Hands out a permanent, ever-increasing number (#1, #2, #3...) for invoices
// or work orders — even if items get deleted later. Safe if you and your
// boss both add something at the same moment — Firestore resolves it so no
// two items ever get the same number.
async function getNextNumber(field) {
  const ref = doc(db, "board", "counters");
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? (snap.data()[field] || 0) : 0;
    const next = current + 1;
    tx.set(ref, { [field]: next }, { merge: true });
    return next;
  });
}
const getNextInvoiceNumber = () => getNextNumber("invoiceNumber");
const getNextWorkOrderNumber = () => getNextNumber("workOrderNumber");

function Stamp({ children, tone }) {
  const tones = {
    green: { bg: C.greenBg, fg: C.green, bd: C.green },
    red: { bg: C.redBg, fg: C.red, bd: C.red },
    amber: { bg: C.amberBg, fg: C.amber, bd: C.amber },
    slate: { bg: "#EAF0F4", fg: C.slate, bd: C.slate },
  };
  const t = tones[tone] || tones.slate;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase rounded-sm border"
      style={{ backgroundColor: t.bg, color: t.fg, borderColor: t.bd, fontFamily: "'IBM Plex Mono', monospace", transform: "rotate(-0.4deg)" }}
    >
      {children}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: C.muted }}>{label}</span>
      {children}
    </label>
  );
}

const inputCls = "px-2.5 py-1.5 rounded-md border bg-white text-sm focus:outline-none focus:ring-2 w-full";
const selectCls = inputCls;
function inputStyle() { return { borderColor: C.hair, color: C.ink }; }

function Btn({ children, onClick, tone = "slate", size = "md", icon: Icon, disabled, type = "button" }) {
  const tones = {
    slate: { bg: C.slate, fg: "#fff" }, green: { bg: C.green, fg: "#fff" },
    red: { bg: C.red, fg: "#fff" }, amber: { bg: C.amber, fg: "#fff" },
    ghost: { bg: "transparent", fg: C.ink },
  };
  const t = tones[tone];
  const pad = size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm";
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md font-medium transition-opacity hover:opacity-90 disabled:opacity-40 ${pad}`}
      style={{ backgroundColor: t.bg, color: t.fg, border: tone === "ghost" ? `1px solid ${C.hair}` : "none" }}>
      {Icon && <Icon size={size === "sm" ? 12 : 14} />}
      {children}
    </button>
  );
}

function NotesLog({ notes, onAdd, label = "Notes", placeholder = "Add a note..." }) {
  const [text, setText] = useState("");
  return (
    <div className="mt-3 pt-3 border-t" style={{ borderColor: C.hair }}>
      <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>{label}</div>
      <div className="flex flex-col gap-1.5 mb-2 max-h-40 overflow-y-auto">
        {notes.length === 0 && <div className="text-sm italic" style={{ color: C.muted }}>Nothing yet.</div>}
        {notes.map((n, i) => (
          <div key={i} className="text-sm rounded px-2 py-1.5" style={{ backgroundColor: C.paperDark }}>
            <span style={{ color: C.muted, fontFamily: "'IBM Plex Mono', monospace" }} className="text-[11px] mr-2">{fmtDate(n.date)}</span>
            {n.text}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder}
          className={inputCls} style={inputStyle()}
          onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { onAdd(text.trim()); setText(""); } }} />
        <Btn size="sm" onClick={() => { if (text.trim()) { onAdd(text.trim()); setText(""); } }}>Add</Btn>
      </div>
    </div>
  );
}

// Shrinks and compresses a photo in the browser before storing it, so a
// phone photo (often 3-5MB) becomes a small enough file to save safely.
function resizeImage(file, maxDim = 900, quality = 0.65) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function PhotoLightbox({ src, onClose }) {
  if (!src) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backgroundColor: "rgba(0,0,0,0.85)" }} onClick={onClose}>
      <img src={src} alt="" className="max-w-full max-h-full rounded-lg" onClick={(e) => e.stopPropagation()} />
      <button onClick={onClose} className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: "rgba(255,255,255,0.15)" }}>
        <X size={20} />
      </button>
    </div>
  );
}

function PhotoAttach({ photos, onAdd, onRemove }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);
  const list = photos || [];

  const handleFiles = async (files) => {
    setBusy(true);
    for (const file of Array.from(files)) {
      try {
        const dataUrl = await resizeImage(file);
        onAdd({ id: uid(), dataUrl, name: file.name, date: todayISO() });
      } catch (e) { console.error("Photo processing failed:", e); }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="mt-3 pt-3 border-t" style={{ borderColor: C.hair }}>
      <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Photos</div>
      {list.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-2">
          {list.map((p) => (
            <div key={p.id} className="relative">
              <img src={p.dataUrl} alt={p.name} className="w-20 h-20 object-cover rounded-md border cursor-pointer" style={{ borderColor: C.hair }}
                onClick={() => setPreview(p.dataUrl)} />
              <button onClick={() => onRemove(p.id)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: C.red }}>
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => e.target.files.length && handleFiles(e.target.files)} />
      <Btn size="sm" tone="ghost" icon={Camera} disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Processing..." : "Add photo"}
      </Btn>
      <PhotoLightbox src={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Like PhotoAttach, but also accepts PDFs — images get compressed and shown
// as thumbnails, PDFs show as a filename you can download (no PDF
// compression exists, so keep an eye on file size for very large PDFs).
function FileAttach({ files, onAdd, onRemove }) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);
  const list = files || [];

  const handleFiles = async (fileList) => {
    setBusy(true);
    for (const file of Array.from(fileList)) {
      try {
        const isImage = file.type.startsWith("image/");
        const dataUrl = isImage ? await resizeImage(file) : await readFileAsDataUrl(file);
        onAdd({ id: uid(), dataUrl, name: file.name, kind: isImage ? "image" : "file", date: todayISO() });
      } catch (e) { console.error("File upload failed:", e); }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="mt-3 pt-3 border-t" style={{ borderColor: C.hair }}>
      <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Files</div>
      {list.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-2">
          {list.map((f) => f.kind === "image" ? (
            <div key={f.id} className="relative">
              <img src={f.dataUrl} alt={f.name} className="w-20 h-20 object-cover rounded-md border cursor-pointer" style={{ borderColor: C.hair }}
                onClick={() => setPreview(f.dataUrl)} />
              <button onClick={() => onRemove(f.id)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: C.red }}>
                <X size={11} />
              </button>
            </div>
          ) : (
            <div key={f.id} className="relative flex items-center gap-1.5 pl-2 pr-6 py-2 rounded-md border max-w-[180px]" style={{ borderColor: C.hair, backgroundColor: C.paperDark }}>
              <FileText size={14} color={C.slate} className="shrink-0" />
              <a href={f.dataUrl} download={f.name} className="text-xs underline truncate" style={{ color: C.ink }}>{f.name}</a>
              <button onClick={() => onRemove(f.id)} className="absolute top-1 right-1" style={{ color: C.red }}><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
        onChange={(e) => e.target.files.length && handleFiles(e.target.files)} />
      <Btn size="sm" tone="ghost" icon={Camera} disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Processing..." : "Add photo or PDF"}
      </Btn>
      <PhotoLightbox src={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function NegotiatedPriceBox({ amount, onChange }) {
  const [val, setVal] = useState("");

  const submit = () => {
    const next = Number(val);
    if (!next || next === Number(amount)) return;
    onChange(next, { field: "amount", from: amount, to: next, by: "boss", date: todayISO() });
    setVal("");
  };

  return (
    <div className="mt-2 mb-3">
      <label className="text-xs font-medium uppercase tracking-wide" style={{ color: C.muted }}>Negotiated / new price</label>
      <div className="flex gap-2 mt-1">
        <input type="text" inputMode="decimal" placeholder={`Current: $${Number(amount).toLocaleString()}`} className={inputCls} style={inputStyle()}
          value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
        <Btn size="sm" onClick={submit}>Save</Btn>
      </div>
    </div>
  );
}

function AmountEditor({ amount, onChange, editorRole, big, linkText }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(amount);

  const save = () => {
    const next = Number(val);
    if (!next || next === Number(amount)) { setEditing(false); return; }
    onChange(next, { field: "amount", from: amount, to: next, by: editorRole, date: todayISO() });
    setEditing(false);
  };
  const cancel = () => { setVal(amount); setEditing(false); };

  const amountEl = (
    <span className={big ? "text-2xl font-bold" : "text-lg font-semibold"} style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.ink }}>
      ${Number(amount).toLocaleString()}
    </span>
  );

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
        <input type="text" inputMode="decimal" autoFocus className={inputCls} style={{ ...inputStyle(), width: 110 }} value={val} onChange={(e) => setVal(e.target.value)} />
        <Btn size="sm" onClick={save}>Save</Btn>
        <Btn size="sm" tone="ghost" onClick={cancel}>Cancel</Btn>
      </div>
    );
  }

  if (linkText) {
    return (
      <div>
        {amountEl}
        <button onClick={(e) => { e.stopPropagation(); setEditing(true); }} className="block text-sm mt-1 underline" style={{ color: C.slate }}>
          {linkText}
        </button>
      </div>
    );
  }

  return (
    <button onClick={(e) => { e.stopPropagation(); setEditing(true); }} className="flex items-center gap-1 hover:opacity-75">
      {amountEl}
      <Pencil size={big ? 14 : 12} color={C.muted} />
    </button>
  );
}

function HistoryLog({ history }) {
  if (!history || history.length === 0) return null;
  return (
    <div className="mt-3 pt-3 border-t text-xs" style={{ borderColor: C.hair, color: C.muted }}>
      <div className="font-medium uppercase tracking-wide mb-1">History</div>
      <div className="flex flex-col gap-1">
        {history.map((h, i) => (
          <div key={i}>
            {fmtDate(h.date)} — amount changed from ${Number(h.from).toLocaleString()} to ${Number(h.to).toLocaleString()} ({h.by === "boss" ? "your boss" : "you"})
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- PICKERS ---------------- */

function ContractorPicker({ contractors, value, onChange, onCreate, label = "Contractor" }) {
  const selected = contractors.find((c) => c.id === value);
  const [query, setQuery] = useState(selected?.name || "");
  const [showMenu, setShowMenu] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newPhone, setNewPhone] = useState("");

  useEffect(() => { setQuery(selected?.name || ""); setShowMenu(false); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim().toLowerCase();
  const matches = q ? contractors.filter((c) => c.name.toLowerCase().includes(q)) : contractors;

  const pick = (c) => { onChange(c.id); setQuery(c.name); setShowMenu(false); setAdding(false); };

  const saveNew = () => {
    if (!query.trim()) return;
    const c = { id: uid(), name: query.trim(), phone: newPhone.trim(), email: "" };
    onCreate(c);
    onChange(c.id);
    setAdding(false); setNewPhone(""); setShowMenu(false);
  };

  return (
    <Field label={label}>
      <div className="relative">
        <input className={inputCls} style={inputStyle()} value={query} placeholder="Type to search vendors..."
          onChange={(e) => { setQuery(e.target.value); setShowMenu(true); if (value) onChange(""); }}
          onFocus={() => setShowMenu(true)}
          onBlur={() => setTimeout(() => setShowMenu(false), 150)} />
        {showMenu && (
          <div className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto rounded-md border" style={{ backgroundColor: C.card, borderColor: C.hair }}>
            {matches.map((c) => (
              <button key={c.id} onMouseDown={() => pick(c)} className="block w-full text-left px-3 py-2 text-sm hover:opacity-75 border-b last:border-b-0" style={{ color: C.ink, borderColor: C.hair }}>
                {c.name}{c.phone ? ` — ${c.phone}` : ""}
              </button>
            ))}
            {matches.length === 0 && <div className="px-3 py-2 text-sm italic" style={{ color: C.muted }}>No matches</div>}
            <button onMouseDown={() => { setAdding(true); setShowMenu(false); }} className="block w-full text-left px-3 py-2 text-sm font-medium" style={{ color: C.slate }}>
              + Add "{query.trim() || "new contractor"}"
            </button>
          </div>
        )}
      </div>
      {adding && (
        <div className="flex gap-2 mt-1.5">
          <input placeholder="Phone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className={inputCls} style={inputStyle()} />
          <Btn size="sm" onClick={saveNew}>Save</Btn>
        </div>
      )}
    </Field>
  );
}

function BuildingApartmentPicker({ buildings, buildingId, apartmentId, onChangeBuilding, onChangeApartment }) {
  const building = buildings.find((b) => b.id === buildingId);
  return (
    <>
      <Field label="Building">
        <select className={selectCls} style={inputStyle()} value={buildingId || ""} onChange={(e) => onChangeBuilding(e.target.value)}>
          <option value="">Select building…</option>
          {sortBuildings(buildings).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {buildings.length === 0 && <div className="text-xs mt-1" style={{ color: C.muted }}>No buildings yet — add one in the Directory tab.</div>}
      </Field>

      <Field label="Apartment">
        <select className={selectCls} style={inputStyle()} value={apartmentId || ""} disabled={!buildingId} onChange={(e) => onChangeApartment(e.target.value)}>
          <option value="">{buildingId ? "Select apartment…" : "Pick a building first"}</option>
          {(building?.apartments || []).map((a) => <option key={a.id} value={a.id}>Apt {a.number}{a.tenantName ? ` — ${a.tenantName}` : ""}</option>)}
        </select>
        {building && building.apartments.length === 0 && <div className="text-xs mt-1" style={{ color: C.muted }}>No apartments on file for this building — add them in the Directory tab.</div>}
      </Field>
    </>
  );
}

// Groups addresses by their leading digit — all the "1..."s together, then
// all the "2..."s, etc. — using plain text comparison rather than sorting
// by the full numeric value.
function naturalCompare(a, b) {
  return (a || "").localeCompare(b || "");
}
function sortBuildings(buildings) {
  return [...buildings].sort((a, b) => naturalCompare(a.name, b.name));
}
// Sorts any list of invoices/work orders/violations by their building's
// address, in the same numeric order as everywhere else — items with no
// building attached sink to the end.
function sortByBuilding(items, buildings) {
  return [...items].sort((a, b) => {
    const ba = lookupBuilding(buildings, a.buildingId)?.name || "";
    const bb = lookupBuilding(buildings, b.buildingId)?.name || "";
    if (!ba && bb) return 1;
    if (ba && !bb) return -1;
    return naturalCompare(ba, bb);
  });
}

function lookupContractor(contractors, id) { return contractors.find((c) => c.id === id); }
function lookupBuilding(buildings, id) { return buildings.find((b) => b.id === id); }
function lookupApartment(buildings, buildingId, apartmentId) {
  const b = lookupBuilding(buildings, buildingId);
  return b ? b.apartments.find((a) => a.id === apartmentId) : null;
}

// Builds one lowercase blob of everything searchable about an invoice or
// work order — vendor/contractor, tenant, building, apartment, phone
// numbers, description — so a single search box can match any of it.
// Looks up a NYC address in the city's public PLUTO property records —
// gives back the ZIP code and total unit count for buildings that match
// what's typed so far. NYC only; other cities have no equivalent lookup.
async function lookupNycAddress(query) {
  if (!query || query.trim().length < 5) return [];
  try {
    const url = `https://data.cityofnewyork.us/resource/64uk-42ks.json?$q=${encodeURIComponent(query)}&$limit=6`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data
      .filter((d) => d.address)
      .map((d) => ({
        address: d.address,
        zip: d.zipcode || "",
        borough: d.borough || "",
        units: d.unitsres ? Number(d.unitsres) : (d.unitstotal ? Number(d.unitstotal) : null),
      }));
  } catch (e) {
    console.error("NYC address lookup failed:", e);
    return [];
  }
}

function invoiceSearchText(inv, contractors, buildings) {
  const contractor = lookupContractor(contractors, inv.contractorId);
  const apartment = lookupApartment(buildings, inv.buildingId, inv.apartmentId);
  const building = lookupBuilding(buildings, inv.buildingId);
  return [
    inv.number, contractor?.name, contractor?.phone, building?.name,
    apartment?.number, apartment?.tenantName, apartment?.tenantPhone, apartment?.tenantEmail,
    inv.description, inv.amount,
  ].filter(Boolean).join(" ").toLowerCase();
}
function workOrderSearchText(w, contractors, buildings) {
  const contractor = lookupContractor(contractors, w.contractorId);
  const apartment = lookupApartment(buildings, w.buildingId, w.apartmentId);
  const building = lookupBuilding(buildings, w.buildingId);
  return [
    w.number, apartment?.tenantName, apartment?.tenantPhone, apartment?.tenantEmail,
    contractor?.name, contractor?.phone, building?.name, apartment?.number, w.issue,
  ].filter(Boolean).join(" ").toLowerCase();
}

function SearchBar({ value, onChange, placeholder }) {
  return (
    <input className={inputCls} style={inputStyle()} value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} />
  );
}

function CollapsibleSection({ label, count, children, forceOpen }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);
  if (count === 0) return null;
  return (
    <div>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 p-3 rounded-lg border text-sm font-medium"
        style={{ borderColor: C.hair, backgroundColor: C.card, color: C.ink }}>
        <span>{label} ({count})</span>
        {open ? <ChevronUp size={16} color={C.muted} /> : <ChevronDown size={16} color={C.muted} />}
      </button>
      {open && <div className="flex flex-col gap-3 mt-3">{children}</div>}
    </div>
  );
}

// Opens a clean, simple printable page in a new tab and triggers the
// browser's print dialog — used for both the invoice and work order print
// buttons below.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function printRecords(title, items, columns) {
  const win = window.open("", "_blank");
  if (!win) { alert("Please allow pop-ups to print."); return; }
  const styles = `
    body { font-family: Arial, Helvetica, sans-serif; padding: 28px; color: #1B2430; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .meta { color: #8A8371; font-size: 12px; margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #DCD5C6; font-size: 12px; vertical-align: top; }
    th { background: #EFEADF; }
    @media print { body { padding: 10px; } }
  `;
  const head = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
  const rows = items.map((item) => `<tr>${columns.map((c) => `<td>${escapeHtml(c.value(item) ?? "—")}</td>`).join("")}</tr>`).join("");
  win.document.write(`<html><head><title>${escapeHtml(title)}</title><style>${styles}</style></head><body>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Printed ${escapeHtml(new Date().toLocaleString())} — ${items.length} item${items.length === 1 ? "" : "s"}</div>
    <table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

function invoiceColumns(contractors, buildings) {
  return [
    { label: "#", value: (i) => i.number },
    { label: "Vendor", value: (i) => lookupContractor(contractors, i.contractorId)?.name },
    { label: "Building", value: (i) => lookupBuilding(buildings, i.buildingId)?.name },
    { label: "Apt", value: (i) => lookupApartment(buildings, i.buildingId, i.apartmentId)?.number },
    { label: "Amount", value: (i) => `$${Number(i.amount).toLocaleString()}` },
    { label: "Date", value: (i) => fmtDate(i.date) },
    { label: "Status", value: (i) => i.status },
    { label: "Description", value: (i) => i.description },
  ];
}
function workOrderColumns(contractors, buildings) {
  return [
    { label: "#", value: (w) => w.number },
    { label: "Tenant", value: (w) => lookupApartment(buildings, w.buildingId, w.apartmentId)?.tenantName },
    { label: "Building", value: (w) => lookupBuilding(buildings, w.buildingId)?.name },
    { label: "Apt", value: (w) => lookupApartment(buildings, w.buildingId, w.apartmentId)?.number },
    { label: "Assigned to", value: (w) => lookupContractor(contractors, w.contractorId)?.name },
    { label: "Issue", value: (w) => w.issue },
    { label: "Status", value: (w) => w.status },
    { label: "Opened", value: (w) => fmtDate(w.dateOpened) },
    { label: "Resolved", value: (w) => fmtDate(w.dateResolved) },
  ];
}

// One Print button with a small menu — Open only / Closed only / Both —
// instead of two separate buttons per tab.
function PrintButton({ title, openItems, closedItems, closedLabel, columns }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const go = (which) => {
    setMenuOpen(false);
    if (which === "open") printRecords(`Open ${title}`, openItems, columns);
    else if (which === "closed") printRecords(`${closedLabel} ${title}`, closedItems, columns);
    else printRecords(`All ${title}`, [...openItems, ...closedItems], columns);
  };
  return (
    <div className="relative inline-block">
      <Btn size="sm" tone="ghost" icon={Printer} onClick={() => setMenuOpen(!menuOpen)}>Print</Btn>
      {menuOpen && (
        <div className="absolute z-20 mt-1 rounded-md border overflow-hidden" style={{ backgroundColor: C.card, borderColor: C.hair, minWidth: 170 }}
          onMouseLeave={() => setMenuOpen(false)}>
          <button onClick={() => go("open")} className="block w-full text-left px-3 py-2 text-sm hover:opacity-75" style={{ color: C.ink }}>Open only</button>
          <button onClick={() => go("closed")} className="block w-full text-left px-3 py-2 text-sm hover:opacity-75" style={{ color: C.ink }}>{closedLabel} only</button>
          <button onClick={() => go("both")} className="block w-full text-left px-3 py-2 text-sm hover:opacity-75" style={{ color: C.ink }}>Both</button>
        </div>
      )}
    </div>
  );
}

// Prints 911s as a written report (title, then its updates underneath) —
// not a table, since these read more like a running log than a data grid.
function printEmergencies(items, buildings) {
  const win = window.open("", "_blank");
  if (!win) { alert("Please allow pop-ups to print."); return; }
  const styles = `
    body { font-family: Georgia, 'Times New Roman', serif; padding: 32px; color: #1B2430; max-width: 720px; margin: 0 auto; }
    h1 { font-size: 20px; margin-bottom: 4px; font-family: Arial, sans-serif; }
    .meta { color: #8A8371; font-size: 12px; margin-bottom: 24px; font-family: Arial, sans-serif; }
    .case { margin-bottom: 22px; page-break-inside: avoid; }
    .case-title { font-size: 16px; font-weight: bold; margin-bottom: 2px; font-family: Arial, sans-serif; }
    .case-meta { font-size: 12px; color: #8A8371; margin-bottom: 8px; font-family: Arial, sans-serif; }
    .update { margin-bottom: 4px; font-size: 14px; line-height: 1.5; }
    .update-date { font-weight: bold; font-family: Arial, sans-serif; }
    hr { border: none; border-top: 1px solid #DCD5C6; margin: 18px 0; }
    @media print { body { padding: 10px; } }
  `;
  const casesHtml = items.map((item) => {
    const building = lookupBuilding(buildings, item.buildingId);
    const apartment = lookupApartment(buildings, item.buildingId, item.apartmentId);
    const ordered = [...(item.updates || [])].reverse();
    const updatesHtml = ordered.length
      ? ordered.map((u) => `<div class="update"><span class="update-date">${escapeHtml(fmtShortDate(u.date))}</span> — ${escapeHtml(u.text)}</div>`).join("")
      : `<div class="update" style="font-style:italic;color:#8A8371;">No updates yet.</div>`;
    return `<div class="case">
      <div class="case-title">${escapeHtml(item.title)}${item.status === "resolved" ? " (Resolved)" : ""}</div>
      <div class="case-meta">${escapeHtml(building?.name || "No building")}${apartment ? " · Apt " + escapeHtml(apartment.number) : ""} · Opened ${escapeHtml(fmtDate(item.createdDate))}</div>
      ${updatesHtml}
    </div><hr/>`;
  }).join("");
  win.document.write(`<html><head><title>911 Report</title><style>${styles}</style></head><body>
    <h1>911 Report</h1>
    <div class="meta">Printed ${escapeHtml(new Date().toLocaleString())} — ${items.length} case${items.length === 1 ? "" : "s"}</div>
    ${casesHtml}
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

function EmergencyPrintButton({ openItems, closedItems, buildings }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const go = (which) => {
    setMenuOpen(false);
    if (which === "open") printEmergencies(openItems, buildings);
    else if (which === "closed") printEmergencies(closedItems, buildings);
    else printEmergencies([...openItems, ...closedItems], buildings);
  };
  return (
    <div className="relative inline-block">
      <Btn size="sm" tone="ghost" icon={Printer} onClick={() => setMenuOpen(!menuOpen)}>Print</Btn>
      {menuOpen && (
        <div className="absolute z-20 mt-1 rounded-md border overflow-hidden" style={{ backgroundColor: C.card, borderColor: C.hair, minWidth: 170 }}
          onMouseLeave={() => setMenuOpen(false)}>
          <button onClick={() => go("open")} className="block w-full text-left px-3 py-2 text-sm hover:opacity-75" style={{ color: C.ink }}>Active only</button>
          <button onClick={() => go("closed")} className="block w-full text-left px-3 py-2 text-sm hover:opacity-75" style={{ color: C.ink }}>Resolved only</button>
          <button onClick={() => go("both")} className="block w-full text-left px-3 py-2 text-sm hover:opacity-75" style={{ color: C.ink }}>Both</button>
        </div>
      )}
    </div>
  );
}

function InvoicePrintButton({ activeItems, paidItems, declinedItems, columns }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const go = (which) => {
    setMenuOpen(false);
    if (which === "open") printRecords("Open Invoices", activeItems, columns);
    else if (which === "paid") printRecords("Paid Invoices", paidItems, columns);
    else if (which === "declined") printRecords("Declined Invoices", declinedItems, columns);
    else printRecords("All Invoices", [...activeItems, ...paidItems, ...declinedItems], columns);
  };
  return (
    <div className="relative inline-block">
      <Btn size="sm" tone="ghost" icon={Printer} onClick={() => setMenuOpen(!menuOpen)}>Print</Btn>
      {menuOpen && (
        <div className="absolute z-20 mt-1 rounded-md border overflow-hidden" style={{ backgroundColor: C.card, borderColor: C.hair, minWidth: 170 }}
          onMouseLeave={() => setMenuOpen(false)}>
          <button onClick={() => go("open")} className="block w-full text-left px-3 py-2 text-sm hover:opacity-75" style={{ color: C.ink }}>Open only</button>
          <button onClick={() => go("paid")} className="block w-full text-left px-3 py-2 text-sm hover:opacity-75" style={{ color: C.ink }}>Paid only</button>
          <button onClick={() => go("declined")} className="block w-full text-left px-3 py-2 text-sm hover:opacity-75" style={{ color: C.ink }}>Declined only</button>
          <button onClick={() => go("all")} className="block w-full text-left px-3 py-2 text-sm hover:opacity-75" style={{ color: C.ink }}>All</button>
        </div>
      )}
    </div>
  );
}

/* ---------------- INVOICES ---------------- */

function MessageThread({ messages, onSend, sendAs, placeholder }) {
  const [text, setText] = useState("");
  const send = () => { if (!text.trim()) return; onSend(text.trim()); setText(""); };
  return (
    <div className="mt-2">
      {messages.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-2 max-h-52 overflow-y-auto p-1">
          {messages.map((m, i) => {
            const mine = m.from === sendAs;
            return (
              <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[80%] rounded-lg px-3 py-1.5 text-sm"
                  style={{ backgroundColor: mine ? C.slate : C.paperDark, color: mine ? "#fff" : C.ink }}>
                  <div className="text-[10px] uppercase tracking-wide mb-0.5 opacity-70" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                    {m.from === "boss" ? "Boss" : "You"} · {fmtDate(m.date)}
                  </div>
                  {m.text}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex gap-2">
        <input className={inputCls} style={inputStyle()} placeholder={placeholder} value={text}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
        <Btn size="sm" onClick={send}>Send</Btn>
      </div>
    </div>
  );
}

function LinkedItemPicker({ workorders, violations, buildings, invoices, contractors, linkedType, linkedId, linkedTaskId, onChange }) {
  const [showLinked, setShowLinked] = useState(false);

  const isPaid = (workOrderId, taskId) => (invoices || []).some((i) => i.linkedType === "workorder" && i.status === "paid" && i.linkedId === workOrderId && (i.linkedTaskId || "") === (taskId || ""));

  // Step 1: which work order. Only lists work orders that have at least one
  // billable thing on them (not marked "not billing") that's either
  // resolved (simple job) or has at least one completed task (split job).
  // A "Not billing" flag on the whole work order overrides everything on
  // it, even if individual tasks were billable.
  const eligibleWorkOrders = workorders.filter((w) => {
    if (w.notBilling) return false;
    const tasks = w.tasks || [];
    if (tasks.length === 0) return w.status === "resolved" && !isPaid(w.id, "");
    return tasks.some((t) => t.status === "completed" && !t.notBilling && !isPaid(w.id, t.id));
  });

  const selectedWorkOrder = linkedType === "workorder" ? workorders.find((w) => w.id === linkedId) : null;
  const selectedTasks = selectedWorkOrder && !selectedWorkOrder.notBilling ? (selectedWorkOrder.tasks || []).filter((t) => t.status === "completed" && !t.notBilling) : [];
  const openTasks = selectedTasks.filter((t) => !isPaid(selectedWorkOrder?.id, t.id));
  const paidTasks = selectedTasks.filter((t) => isPaid(selectedWorkOrder?.id, t.id));

  const kind = linkedType === "violation" ? "violation" : linkedType === "workorder" ? "workorder" : "none";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="Link to">
        <select className={selectCls} style={inputStyle()} value={kind}
          onChange={(e) => { setShowLinked(false); onChange(e.target.value === "none" ? "none" : e.target.value, "", ""); }}>
          <option value="none">Not linked</option>
          <option value="workorder">A work order</option>
          <option value="violation">An HPD violation</option>
        </select>
      </Field>

      {kind === "workorder" && (
        <Field label="Which work order">
          <select className={selectCls} style={inputStyle()} value={linkedId || ""}
            onChange={(e) => { setShowLinked(false); onChange("workorder", e.target.value, ""); }}>
            <option value="">Select work order...</option>
            {eligibleWorkOrders.length === 0 && <option value="" disabled>No completed, billable work orders yet</option>}
            {eligibleWorkOrders.map((w) => {
              const b = lookupBuilding(buildings, w.buildingId);
              return <option key={w.id} value={w.id}>#{w.number ?? "—"} — {b?.name || "No building"} — {(w.issue || "").slice(0, 30)}</option>;
            })}
          </select>
        </Field>
      )}

      {kind === "workorder" && selectedWorkOrder && selectedTasks.length > 0 && (
        <div className="sm:col-span-2">
          <Field label="Which vendor's part of the job">
            <select className={selectCls} style={inputStyle()} value={linkedTaskId || ""}
              onChange={(e) => onChange("workorder", linkedId, e.target.value)}>
              <option value="">Select vendor's task...</option>
              {openTasks.map((t) => {
                const c = lookupContractor(contractors, t.contractorId);
                return <option key={t.id} value={t.id}>{t.description}{c ? ` — ${c.name}` : " — unassigned vendor"}</option>;
              })}
              {showLinked && paidTasks.map((t) => {
                const c = lookupContractor(contractors, t.contractorId);
                return <option key={t.id} value={t.id}>{t.description}{c ? ` — ${c.name}` : " — unassigned vendor"} — paid already</option>;
              })}
            </select>
          </Field>
          {paidTasks.length > 0 && (
            <label className="flex items-center gap-1.5 text-xs mt-1.5" style={{ color: C.muted }}>
              <input type="checkbox" checked={showLinked} onChange={(e) => setShowLinked(e.target.checked)} />
              Multiple vendors on this job — show tasks that already have a paid invoice ({paidTasks.length})
            </label>
          )}
        </div>
      )}

      {kind === "violation" && (
        <Field label="Which violation">
          <select className={selectCls} style={inputStyle()} value={linkedId || ""}
            onChange={(e) => onChange("violation", e.target.value, "")}>
            <option value="">Select violation...</option>
            {violations.length === 0 && <option value="" disabled>No violations yet</option>}
            {violations.map((v) => {
              const b = lookupBuilding(buildings, v.buildingId);
              return <option key={v.id} value={v.id}>#{v.violationNumber || "—"} — {b?.name || "No building"} — {(v.description || "").slice(0, 40)}</option>;
            })}
          </select>
        </Field>
      )}
    </div>
  );
}

function InvoiceForm({ contractors, buildings, workorders, violations, invoices, onCreateContractor, onSave, onCancel }) {
  const [f, setF] = useState({ contractorId: "", buildingId: "", apartmentId: "", amount: "", description: "", date: todayISO(), linkedType: "none", linkedId: "", linkedTaskId: "" });
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));

  const handleLinkChange = (linkedType, linkedId, linkedTaskId) => {
    setF((prev) => {
      if (linkedType === "workorder") {
        const w = workorders.find((x) => x.id === linkedId);
        if (w) {
          const hasTasks = (w.tasks || []).length > 0;
          const task = linkedTaskId ? (w.tasks || []).find((t) => t.id === linkedTaskId) : null;
          if (hasTasks && !task) {
            // Work order picked, but not a specific vendor's task yet — hold
            // off on filling in description/vendor until that's chosen, so
            // the whole job's info doesn't leak in prematurely.
            return { ...prev, linkedType, linkedId, linkedTaskId: "", buildingId: w.buildingId || "", apartmentId: w.apartmentId || "" };
          }
          return {
            ...prev, linkedType, linkedId, linkedTaskId: linkedTaskId || "",
            buildingId: w.buildingId || "", apartmentId: w.apartmentId || "",
            contractorId: (task ? task.contractorId : w.contractorId) || "",
            description: task ? task.description : (w.issue || ""),
          };
        }
      }
      if (linkedType === "violation") {
        const v = violations.find((x) => x.id === linkedId);
        if (v) return { ...prev, linkedType, linkedId, linkedTaskId: "", buildingId: v.buildingId || "", apartmentId: v.apartmentId || "", contractorId: v.contractorId || prev.contractorId };
      }
      return { ...prev, linkedType, linkedId, linkedTaskId: linkedTaskId || "" };
    });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-lg border" style={{ borderColor: C.hair, backgroundColor: C.card }}>
      <div className="sm:col-span-2">
        <LinkedItemPicker workorders={workorders} violations={violations} buildings={buildings} invoices={invoices} contractors={contractors}
          linkedType={f.linkedType} linkedId={f.linkedId} linkedTaskId={f.linkedTaskId} onChange={handleLinkChange} />
        {f.linkedType !== "none" && (
          <div className="text-xs mt-1" style={{ color: C.muted }}>Building, apartment, vendor, and description were filled in below — change any of them if needed.</div>
        )}
      </div>
      <ContractorPicker contractors={contractors} value={f.contractorId} onChange={(id) => setF((prev) => ({ ...prev, contractorId: id }))} onCreate={onCreateContractor} label="Vendor / contractor" />
      <Field label="Amount ($)"><input className={inputCls} style={inputStyle()} type="text" inputMode="decimal" value={f.amount} onChange={set("amount")} /></Field>
      <BuildingApartmentPicker buildings={buildings} buildingId={f.buildingId} apartmentId={f.apartmentId}
        onChangeBuilding={(id) => setF((prev) => ({ ...prev, buildingId: id, apartmentId: "" }))} onChangeApartment={(id) => setF((prev) => ({ ...prev, apartmentId: id }))} />
      <Field label="Date submitted"><input className={inputCls} style={inputStyle()} type="date" value={f.date} onChange={set("date")} /></Field>
      <div className="sm:col-span-2"><Field label="Job description"><textarea className={inputCls} style={inputStyle()} rows={2} value={f.description} onChange={set("description")} /></Field></div>
      <div className="sm:col-span-2 flex gap-2 justify-end pt-1">
        <Btn tone="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn icon={Plus} onClick={() => { if (!f.contractorId || !f.amount) return; onSave({ ...f, id: uid(), status: "pending", messages: [], notes: [] }); }}>Add invoice</Btn>
      </div>
    </div>
  );
}

function InvoiceCard({ inv, contractors, buildings, workorders, violations, onUpdate, onDelete, cardRef, forceOpenId }) {
  const [open, setOpen] = useState(false);
  const contractor = lookupContractor(contractors, inv.contractorId);
  const building = lookupBuilding(buildings, inv.buildingId);
  const messages = inv.messages || [];
  const stamp = inv.status === "approved" ? <Stamp tone="green">Approved</Stamp> :
    inv.status === "paid" ? <Stamp tone="green">Paid</Stamp> :
    inv.status === "declined" ? <Stamp tone="red">Declined</Stamp> : <Stamp tone="slate">Pending</Stamp>;

  const linkedWorkOrder = inv.linkedType === "workorder" ? workorders.find((w) => w.id === inv.linkedId) : null;
  const linkedTask = linkedWorkOrder && inv.linkedTaskId ? (linkedWorkOrder.tasks || []).find((t) => t.id === inv.linkedTaskId) : null;
  const linkedViolation = inv.linkedType === "violation" ? violations.find((v) => v.id === inv.linkedId) : null;

  const sendMessage = (text) => onUpdate({ ...inv, messages: [...messages, { from: "manager", text, date: todayISO() }] });

  useEffect(() => { if (forceOpenId && forceOpenId === inv.id) setOpen(true); }, [forceOpenId, inv.id]);

  return (
    <div ref={cardRef} className="rounded-lg border overflow-hidden" style={{ borderColor: C.hair, backgroundColor: C.card }}>
      <div className="p-3 flex items-start justify-between gap-3 cursor-pointer" onClick={() => setOpen(!open)}>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: C.paperDark, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>#{inv.number ?? "—"}</span>
            <span className="font-semibold" style={{ color: C.ink }}>{contractor?.name || "Unassigned vendor"}</span>
            {stamp}
            {messages.length > 0 && <Stamp tone="amber">{messages.length} msg{messages.length === 1 ? "" : "s"}</Stamp>}
          </div>
          <div className="text-sm mt-0.5" style={{ color: C.muted }}>{building?.name || "No building"} · {fmtDate(inv.date)}</div>
          <div className="text-sm mt-1" style={{ color: C.ink }}>{inv.description}</div>
          {(linkedWorkOrder || linkedViolation) && (
            <div className="text-xs mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded" style={{ backgroundColor: C.paperDark, color: C.slate }}>
              {linkedWorkOrder ? <Wrench size={11} /> : <ShieldAlert size={11} />}
              {linkedWorkOrder ? `Work Order #${linkedWorkOrder.number ?? "—"}${linkedTask ? ` — ${linkedTask.description}` : ""}` : `HPD Violation #${linkedViolation.violationNumber || "—"}`}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-semibold" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.ink }}>${Number(inv.amount).toLocaleString()}</div>
          {open ? <ChevronUp size={16} className="ml-auto mt-1" color={C.muted} /> : <ChevronDown size={16} className="ml-auto mt-1" color={C.muted} />}
        </div>
      </div>
      {open && (
        <div className="px-3 pb-3">
          <AmountEditor amount={inv.amount} editorRole="manager"
            onChange={(newAmount, historyEntry) => onUpdate({ ...inv, amount: newAmount, history: [...(inv.history || []), historyEntry] })} />
          <div className="flex flex-wrap gap-2 mt-2">
            {inv.status !== "approved" && inv.status !== "paid" && <Btn size="sm" tone="green" icon={Check} onClick={() => onUpdate({ ...inv, status: "approved" })}>Approve</Btn>}
            {inv.status !== "declined" && inv.status !== "paid" && <Btn size="sm" tone="red" icon={X} onClick={() => onUpdate({ ...inv, status: "declined" })}>Decline</Btn>}
            {inv.status === "approved" && <Btn size="sm" tone="slate" icon={CheckCircle2} onClick={() => onUpdate({ ...inv, status: "paid" })}>Mark paid</Btn>}
            {inv.status === "paid" && <Btn size="sm" tone="ghost" onClick={() => onUpdate({ ...inv, status: "approved" })}>Unmark paid</Btn>}
            <Btn size="sm" tone="ghost" icon={Trash2} onClick={() => onDelete(inv.id)}>Remove</Btn>
          </div>
          <div className="mt-3 pt-3 border-t" style={{ borderColor: C.hair }}>
            <div className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: C.muted }}>Conversation with your boss</div>
            <MessageThread messages={messages} onSend={sendMessage} sendAs="manager" placeholder="Reply to your boss's question..." />
          </div>
          <HistoryLog history={inv.history} />
          <PhotoAttach photos={inv.photos}
            onAdd={(p) => onUpdate({ ...inv, photos: [...(inv.photos || []), p] })}
            onRemove={(id) => onUpdate({ ...inv, photos: (inv.photos || []).filter((p) => p.id !== id) })} />
          <NotesLog notes={inv.notes || []} onAdd={(text) => onUpdate({ ...inv, notes: [...(inv.notes || []), { text, date: todayISO() }] })} />
        </div>
      )}
    </div>
  );
}


/* ---------------- VIOLATIONS ---------------- */

function ViolationForm({ contractors, buildings, onCreateContractor, onSave, onCancel }) {
  const [f, setF] = useState({ violationNumber: "", buildingId: "", apartmentId: "", description: "", issueDate: todayISO(), cureDate: "", contractorId: "" });
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-lg border" style={{ borderColor: C.hair, backgroundColor: C.card }}>
      <Field label="HPD violation #"><input className={inputCls} style={inputStyle()} value={f.violationNumber} onChange={set("violationNumber")} /></Field>
      <Field label="Cure date"><input className={inputCls} style={inputStyle()} type="date" value={f.cureDate} onChange={set("cureDate")} /></Field>
      <BuildingApartmentPicker buildings={buildings} buildingId={f.buildingId} apartmentId={f.apartmentId}
        onChangeBuilding={(id) => setF((prev) => ({ ...prev, buildingId: id, apartmentId: "" }))} onChangeApartment={(id) => setF((prev) => ({ ...prev, apartmentId: id }))} />
      <ContractorPicker contractors={contractors} value={f.contractorId} onChange={(id) => setF((prev) => ({ ...prev, contractorId: id }))} onCreate={onCreateContractor} label="Assign to (contractor)" />
      <div className="sm:col-span-2"><Field label="Violation description"><textarea className={inputCls} style={inputStyle()} rows={2} value={f.description} onChange={set("description")} /></Field></div>
      <div className="sm:col-span-2 flex gap-2 justify-end pt-1">
        <Btn tone="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn icon={Plus} onClick={() => { if (!f.buildingId || !f.cureDate) return; onSave({ ...f, id: uid(), status: f.contractorId ? "assigned" : "open", photoNote: "", notes: [] }); }}>Add violation</Btn>
      </div>
    </div>
  );
}

function urgency(v) {
  if (v.status === "resolved") return { tone: "green", label: "Cured" };
  const d = daysBetween(todayISO(), v.cureDate);
  if (d < 0) return { tone: "red", label: `Overdue ${Math.abs(d)}d` };
  if (d === 0) return { tone: "red", label: "Due today" };
  if (d <= 1) return { tone: "red", label: "Due tomorrow" };
  if (d <= 7) return { tone: "amber", label: `Due in ${d}d` };
  return { tone: "slate", label: `Due in ${d}d` };
}

function ViolationCard({ v, contractors, buildings, onCreateContractor, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const u = urgency(v);
  const building = lookupBuilding(buildings, v.buildingId);
  const apartment = lookupApartment(buildings, v.buildingId, v.apartmentId);
  const contractor = lookupContractor(contractors, v.contractorId);

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: C.hair, backgroundColor: C.card }}>
      <div className="p-3 flex items-start justify-between gap-3 cursor-pointer" onClick={() => setOpen(!open)}>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold" style={{ color: C.ink }}>#{v.violationNumber || "—"} — {building?.name || "No building"}{apartment ? `, Apt ${apartment.number}` : ""}</span>
            <Stamp tone={u.tone}>{u.label}</Stamp>
          </div>
          <div className="text-sm mt-1" style={{ color: C.ink }}>{v.description}</div>
          <div className="text-sm mt-1" style={{ color: C.muted }}>{contractor ? `Assigned: ${contractor.name}` : "Unassigned"} · Cure by {fmtDate(v.cureDate)}</div>
        </div>
        {open ? <ChevronUp size={16} color={C.muted} /> : <ChevronDown size={16} color={C.muted} />}
      </div>
      {open && (
        <div className="px-3 pb-3">
          {apartment && (
            <div className="text-sm mb-3 p-3 rounded flex items-start gap-2" style={{ backgroundColor: C.paperDark }}>
              <User size={14} className="mt-0.5" color={C.slate} />
              <div>
                <div className="font-medium" style={{ color: C.ink }}>Tenant on file: {apartment.tenantName || "—"}</div>
                <div style={{ color: C.muted }}>{apartment.tenantPhone || "no phone"} · {apartment.tenantEmail || "no email"}</div>
              </div>
            </div>
          )}
          <ContractorPicker contractors={contractors} value={v.contractorId}
            onChange={(id) => onUpdate({ ...v, contractorId: id, status: v.status === "open" ? "assigned" : v.status })}
            onCreate={onCreateContractor} label="Assign to (contractor)" />
          <NotifyPanel kind="violation" buildingName={building?.name || ""} aptNumber={apartment?.number || ""} description={v.description} cureDate={v.cureDate} tenant={apartment} contractor={contractor} />
          <div className="flex flex-wrap gap-2 mt-3">
            {v.status !== "resolved" && <Btn size="sm" tone="green" icon={CheckCircle2} onClick={() => onUpdate({ ...v, status: "resolved" })}>Mark cured</Btn>}
            {v.status === "resolved" && <Btn size="sm" tone="ghost" onClick={() => onUpdate({ ...v, status: "assigned" })}>Reopen</Btn>}
            <Btn size="sm" tone="ghost" icon={Trash2} onClick={() => onDelete(v.id)}>Remove</Btn>
          </div>
          <Field label="Photo / repair proof (link or description)">
            <input className={`${inputCls} mt-1`} style={inputStyle()} placeholder="Paste a photo link the contractor sent, or describe it"
              value={v.photoNote || ""} onChange={(e) => onUpdate({ ...v, photoNote: e.target.value })} />
          </Field>
          <NotesLog notes={v.notes || []} onAdd={(text) => onUpdate({ ...v, notes: [...(v.notes || []), { text, date: todayISO() }] })} />
        </div>
      )}
    </div>
  );
}

/* ---------------- WORK ORDERS ---------------- */

function WorkOrderForm({ contractors, buildings, onCreateContractor, onSave, onCancel }) {
  const [f, setF] = useState({ buildingId: "", apartmentId: "", issue: "", contractorId: "", dateOpened: todayISO() });
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  const apartment = lookupApartment(buildings, f.buildingId, f.apartmentId);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-lg border" style={{ borderColor: C.hair, backgroundColor: C.card }}>
      <BuildingApartmentPicker buildings={buildings} buildingId={f.buildingId} apartmentId={f.apartmentId}
        onChangeBuilding={(id) => setF((prev) => ({ ...prev, buildingId: id, apartmentId: "" }))}
        onChangeApartment={(id) => setF((prev) => ({ ...prev, apartmentId: id }))} />
      {apartment && (
        <div className="sm:col-span-2 text-sm p-2.5 rounded flex items-start gap-2" style={{ backgroundColor: C.paperDark }}>
          <User size={14} className="mt-0.5" color={C.slate} />
          <div>
            <div className="font-medium" style={{ color: C.ink }}>Tenant on file: {apartment.tenantName || "—"}</div>
            <div style={{ color: C.muted }}>{apartment.tenantPhone || "no phone"} · {apartment.tenantEmail || "no email"}</div>
          </div>
        </div>
      )}
      <ContractorPicker contractors={contractors} value={f.contractorId} onChange={(id) => setF((prev) => ({ ...prev, contractorId: id }))} onCreate={onCreateContractor} label="Assigned to" />
      <Field label="Date opened"><input className={inputCls} style={inputStyle()} type="date" value={f.dateOpened} onChange={set("dateOpened")} /></Field>
      <div className="sm:col-span-2"><Field label="Issue"><textarea className={inputCls} style={inputStyle()} rows={2} value={f.issue} onChange={set("issue")} /></Field></div>
      <div className="sm:col-span-2 flex gap-2 justify-end pt-1">
        <Btn tone="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn icon={Plus} onClick={() => { if (!f.apartmentId || !f.issue) return; onSave({ ...f, id: uid(), status: f.contractorId ? "in-progress" : "open", dateResolved: "", notes: [] }); }}>Add work order</Btn>
      </div>
    </div>
  );
}

function notifyMessage({ kind, buildingName, aptNumber, description, cureDate, tenant, contractorName }) {
  const loc = `${buildingName}${aptNumber ? " apt " + aptNumber : ""}`;
  const who = contractorName ? `Hi ${contractorName} — ` : "";
  const tenantLine = tenant?.tenantName ? ` Tenant: ${tenant.tenantName}${tenant.tenantPhone ? ", " + tenant.tenantPhone : ""}.` : "";
  if (kind === "violation") {
    return `${who}HPD violation at ${loc}: ${description}. Cure date: ${fmtDate(cureDate)}.${tenantLine} Please text updates and a photo when the repair is done.`;
  }
  return `${who}Work order at ${loc}: ${description}.${tenantLine} Please contact the tenant to schedule and let me know when it's done.`;
}

function NotifyPanel({ kind, buildingName, aptNumber, description, cureDate, tenant, contractor }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const msg = notifyMessage({ kind, buildingName, aptNumber, description, cureDate, tenant, contractorName: contractor?.name });

  const copy = async () => {
    try { await navigator.clipboard.writeText(msg); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <div className="mt-2">
      <Btn size="sm" tone="amber" icon={MessageCircle} onClick={() => setShow(!show)}>Notify contractor</Btn>
      {show && (
        <div className="text-sm mt-2 p-3 rounded" style={{ backgroundColor: C.paperDark }}>
          <div style={{ color: C.ink }}>{msg}</div>
          <div className="mt-2"><Btn size="sm" tone="ghost" icon={Copy} onClick={copy}>{copied ? "Copied" : "Copy message"}</Btn></div>
          <div className="text-xs mt-1.5" style={{ color: C.muted }}>
            Copies to your clipboard — paste it into Messages{contractor?.phone ? ` to ${contractor.phone}` : ""}.
          </div>
        </div>
      )}
    </div>
  );
}

function TaskManager({ tasks, contractors, buildingName, aptNumber, tenant, issueText, onCreateContractor, onChange }) {
  const list = tasks || [];
  const [desc, setDesc] = useState("");
  const [contractorId, setContractorId] = useState("");

  const splitInto = (text) => {
    const parts = (text || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    onChange([...list, ...parts.map((p) => ({ id: uid(), description: p, contractorId: "", status: "open", notBilling: false }))]);
  };

  const addTask = () => {
    if (!desc.trim()) return;
    const parts = desc.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      splitInto(desc);
    } else {
      onChange([...list, { id: uid(), description: parts[0], contractorId, status: "open", notBilling: false }]);
    }
    setDesc(""); setContractorId("");
  };
  const updateTask = (id, patch) => onChange(list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const removeTask = (id) => onChange(list.filter((t) => t.id !== id));
  const markAllComplete = () => onChange(list.map((t) => (t.status === "completed" ? t : { ...t, status: "completed", completedDate: todayISO() })));

  const doneCount = list.filter((t) => t.status === "completed").length;
  const issueHasCommas = (issueText || "").includes(",");

  return (
    <div className="mt-3 pt-3 border-t" style={{ borderColor: C.hair }}>
      {list.length === 0 && issueHasCommas && (
        <div className="mb-3 p-2.5 rounded flex items-center justify-between gap-2 flex-wrap" style={{ backgroundColor: C.amberBg }}>
          <div className="text-xs" style={{ color: C.ink }}>The job description above has commas — split it into separate vendor tasks?</div>
          <Btn size="sm" onClick={() => splitInto(issueText)}>Split it for me</Btn>
        </div>
      )}
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium uppercase tracking-wide" style={{ color: C.muted }}>
          Tasks by vendor {list.length > 0 ? `(${doneCount}/${list.length} complete)` : ""}
        </div>
        {list.length > 0 && doneCount < list.length && (
          <Btn size="sm" tone="ghost" icon={CheckCircle2} onClick={markAllComplete}>Mark all complete</Btn>
        )}
      </div>
      <div className="flex flex-col gap-2 mb-2">
        {list.length === 0 && <div className="text-sm italic" style={{ color: C.muted }}>No tasks split out yet — leave empty for a single-vendor job.</div>}
        {list.map((t) => {
          const c = lookupContractor(contractors, t.contractorId);
          return (
            <div key={t.id} className="p-2 rounded" style={{ backgroundColor: C.paperDark }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-sm min-w-0 flex-1">
                  <div style={{ color: C.ink }} className="truncate">{t.description}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                  {t.notBilling && <Stamp tone="slate">Not billing</Stamp>}
                  {t.status === "completed" ? <Stamp tone="green">Done</Stamp> : <Stamp tone="slate">Open</Stamp>}
                  {t.status !== "completed"
                    ? <Btn size="sm" tone="green" onClick={() => updateTask(t.id, { status: "completed", completedDate: todayISO() })}>Complete</Btn>
                    : <Btn size="sm" tone="ghost" onClick={() => updateTask(t.id, { status: "open" })}>Reopen</Btn>}
                  <Btn size="sm" tone="ghost" onClick={() => updateTask(t.id, { notBilling: !t.notBilling })}>{t.notBilling ? "Billable" : "Not billing"}</Btn>
                  <Btn size="sm" tone="ghost" icon={Trash2} onClick={() => removeTask(t.id)} />
                </div>
              </div>
              <div className="mt-1.5">
                <ContractorPicker contractors={contractors} value={t.contractorId}
                  onChange={(id) => updateTask(t.id, { contractorId: id, assignedDate: id ? (t.assignedDate || todayISO()) : t.assignedDate })}
                  onCreate={onCreateContractor} label="Vendor" />
              </div>
              {c && <NotifyPanel kind="workorder" buildingName={buildingName} aptNumber={aptNumber} description={t.description} tenant={tenant} contractor={c} />}
            </div>
          );
        })}
      </div>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1">
          <input className={inputCls} style={inputStyle()} placeholder="e.g. Plumbing repair, Replace tile, Patch drywall" value={desc} onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTask(); } }} />
        </div>
        <div className="sm:w-56">
          <ContractorPicker contractors={contractors} value={contractorId} onChange={setContractorId} onCreate={onCreateContractor} label="Vendor (optional)" />
        </div>
        <Btn size="sm" icon={Plus} onClick={addTask}>Add task</Btn>
      </div>
      <div className="text-xs mt-1" style={{ color: C.muted }}>Tip: separate multiple jobs with commas to add them all at once, then assign a vendor to each one below.</div>
    </div>
  );
}

function WorkOrderCard({ w, contractors, buildings, onCreateContractor, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const building = lookupBuilding(buildings, w.buildingId);
  const apartment = lookupApartment(buildings, w.buildingId, w.apartmentId);
  const contractor = lookupContractor(contractors, w.contractorId);
  const days = daysBetween(w.dateOpened, w.dateResolved || todayISO());
  const tasks = w.tasks || [];
  const stamp = w.status === "resolved" ? <Stamp tone="green">Resolved</Stamp> :
    w.status === "in-progress" ? <Stamp tone="amber">In progress</Stamp> : <Stamp tone="slate">Open</Stamp>;

  return (
    <div className="rounded border overflow-hidden" style={{ borderColor: C.hair, backgroundColor: C.card }}>
      <div className="pl-2 pr-1.5 py-0.5 flex items-center justify-between gap-2 cursor-pointer" onClick={() => setOpen(!open)}>
        <div className="min-w-0 flex-1 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-semibold px-1 rounded shrink-0" style={{ backgroundColor: C.paperDark, color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>#{w.number ?? "—"}</span>
          <span className="font-semibold text-xs truncate" style={{ color: C.ink }}>{building?.name || "No building"}{apartment ? ` · Apt ${apartment.number}` : ""}</span>
          <span className="text-xs truncate" style={{ color: C.muted }}>
            {apartment?.tenantName || "No tenant"} · {w.issue} · {tasks.length > 0
              ? `${tasks.filter((t) => t.contractorId).length}/${tasks.length} vendors`
              : (contractor ? contractor.name : "Unassigned")} · {days}d{w.status === "resolved" ? " (resolved)" : ""}
          </span>
          {stamp}
          {w.notBilling && <Stamp tone="slate">Not billing</Stamp>}
          {tasks.length > 0 && <Stamp tone="slate">{tasks.filter((t) => t.status === "completed").length}/{tasks.length} tasks</Stamp>}
        </div>
        {open ? <ChevronUp size={13} className="shrink-0" color={C.muted} /> : <ChevronDown size={13} className="shrink-0" color={C.muted} />}
      </div>
      {open && (
        <div className="px-3 pb-3">
          {apartment && (
            <div className="text-sm mb-3 p-2.5 rounded flex items-start gap-2" style={{ backgroundColor: C.paperDark }}>
              <User size={14} className="mt-0.5" color={C.slate} />
              <div>
                <div className="font-medium" style={{ color: C.ink }}>{apartment.tenantName || "—"}</div>
                <div style={{ color: C.muted }}>{apartment.tenantPhone || "no phone"} · {apartment.tenantEmail || "no email"}</div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-1">
            <ContractorPicker contractors={contractors} value={w.contractorId}
              onChange={(id) => onUpdate({ ...w, contractorId: id, assignedDate: id ? (w.assignedDate || todayISO()) : w.assignedDate, status: w.status === "open" ? "in-progress" : w.status })}
              onCreate={onCreateContractor} label="Overall assigned to (optional if split by task below)" />
            <Field label="Date resolved"><input className={inputCls} style={inputStyle()} type="date" value={w.dateResolved}
              onChange={(e) => onUpdate({ ...w, dateResolved: e.target.value, status: e.target.value ? "resolved" : "in-progress" })} /></Field>
          </div>
          {tasks.length === 0 && contractor && (
            <NotifyPanel kind="workorder" buildingName={building?.name || ""} aptNumber={apartment?.number || ""} description={w.issue} tenant={apartment} contractor={contractor} />
          )}
          <TaskManager tasks={w.tasks} contractors={contractors} buildingName={building?.name || ""} aptNumber={apartment?.number || ""} tenant={apartment} issueText={w.issue}
            onCreateContractor={onCreateContractor}
            onChange={(tasks) => onUpdate({ ...w, tasks, status: (tasks.length > 0 && w.status === "open") ? "in-progress" : w.status })} />
          <div className="flex flex-wrap gap-2 mt-3">
            {w.status !== "resolved" && <Btn size="sm" tone="green" icon={CheckCircle2} onClick={() => onUpdate({ ...w, status: "resolved", dateResolved: todayISO(), tasks: tasks.map((t) => (t.status === "completed" ? t : { ...t, status: "completed", completedDate: todayISO() })) })}>Mark resolved</Btn>}
            <Btn size="sm" tone="ghost" onClick={() => onUpdate({ ...w, notBilling: !w.notBilling })}>{w.notBilling ? "Mark billable" : "Not billing"}</Btn>
            <Btn size="sm" tone="ghost" icon={Trash2} onClick={() => onDelete(w.id)}>Remove</Btn>
          </div>
          <PhotoAttach photos={w.photos}
            onAdd={(p) => onUpdate({ ...w, photos: [...(w.photos || []), p] })}
            onRemove={(id) => onUpdate({ ...w, photos: (w.photos || []).filter((p) => p.id !== id) })} />
          <NotesLog notes={w.notes || []} onAdd={(text) => onUpdate({ ...w, notes: [...(w.notes || []), { text, date: todayISO() }] })} />
        </div>
      )}
    </div>
  );
}

/* ---------------- 911 ---------------- */

function EmergencyForm({ buildings, onSave, onCancel }) {
  const [f, setF] = useState({ title: "", buildingId: "", apartmentId: "", note: "" });
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-lg border" style={{ borderColor: C.hair, backgroundColor: C.card }}>
      <div className="sm:col-span-2">
        <Field label="Title"><input className={inputCls} style={inputStyle()} placeholder="e.g. Boiler failure — no heat" value={f.title} onChange={set("title")} /></Field>
      </div>
      <BuildingApartmentPicker buildings={buildings} buildingId={f.buildingId} apartmentId={f.apartmentId}
        onChangeBuilding={(id) => setF((prev) => ({ ...prev, buildingId: id, apartmentId: "" }))}
        onChangeApartment={(id) => setF((prev) => ({ ...prev, apartmentId: id }))} />
      <div className="sm:col-span-2">
        <Field label="What's happening"><textarea className={inputCls} style={inputStyle()} rows={2} value={f.note} onChange={set("note")} /></Field>
      </div>
      <div className="sm:col-span-2 flex gap-2 justify-end pt-1">
        <Btn tone="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn icon={Plus} onClick={() => {
          if (!f.title.trim()) return;
          const updates = f.note.trim() ? [{ text: f.note.trim(), date: todayISO() }] : [];
          onSave({ ...f, id: uid(), status: "open", createdDate: todayISO(), updates, files: [] });
        }}>Add 911</Btn>
      </div>
    </div>
  );
}

function UpdateLog({ updates, onAdd }) {
  const [text, setText] = useState("");
  const ordered = [...updates].reverse(); // newest first, like a log
  return (
    <div className="mt-3 pt-3 border-t" style={{ borderColor: C.hair }}>
      <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Updates</div>
      <div className="mb-3 max-h-72 overflow-y-auto" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
        {ordered.length === 0 && <div className="text-sm italic" style={{ color: C.muted, fontFamily: "'IBM Plex Sans', sans-serif" }}>No updates yet.</div>}
        {ordered.map((n, i) => (
          <div key={i} className="text-sm leading-relaxed py-1">
            <span className="font-bold" style={{ color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>{fmtShortDate(n.date)}</span>
            <span style={{ color: C.ink }}> — {n.text}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an update..."
          className={inputCls} style={inputStyle()}
          onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { onAdd(text.trim()); setText(""); } }} />
        <Btn size="sm" onClick={() => { if (text.trim()) { onAdd(text.trim()); setText(""); } }}>Add</Btn>
      </div>
    </div>
  );
}

function EmergencyCard({ item, buildings, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const building = lookupBuilding(buildings, item.buildingId);
  const apartment = lookupApartment(buildings, item.buildingId, item.apartmentId);
  const updates = item.updates || [];
  const lastUpdateDate = updates.length ? updates[updates.length - 1].date : item.createdDate;
  const stamp = item.status === "resolved" ? <Stamp tone="green">Resolved</Stamp> : <Stamp tone="red">Active</Stamp>;

  return (
    <div className="rounded-md border overflow-hidden" style={{ borderColor: C.hair, backgroundColor: C.card }}>
      <div className="pl-3 pr-2 py-1.5 flex items-center justify-between gap-2 cursor-pointer" onClick={() => setOpen(!open)}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm truncate" style={{ color: C.ink }}>{item.title}</span>
            {stamp}
          </div>
          <div className="text-xs mt-0.5" style={{ color: C.muted }}>Last updated {fmtShortDate(lastUpdateDate)}</div>
        </div>
        {open ? <ChevronUp size={15} className="shrink-0" color={C.muted} /> : <ChevronDown size={15} className="shrink-0" color={C.muted} />}
      </div>
      {open && (
        <div className="px-3 pb-3">
          {(building || apartment) && (
            <div className="text-xs mb-2" style={{ color: C.muted }}>{building?.name || "No building"}{apartment ? ` · Apt ${apartment.number}` : ""} · Opened {fmtDate(item.createdDate)}</div>
          )}
          <div className="flex flex-wrap gap-2 mb-1">
            {item.status !== "resolved"
              ? <Btn size="sm" tone="green" icon={CheckCircle2} onClick={() => onUpdate({ ...item, status: "resolved" })}>Mark resolved</Btn>
              : <Btn size="sm" tone="ghost" onClick={() => onUpdate({ ...item, status: "open" })}>Reopen</Btn>}
            <Btn size="sm" tone="ghost" icon={Trash2} onClick={() => onDelete(item.id)}>Remove</Btn>
          </div>
          <UpdateLog updates={updates}
            onAdd={(text) => onUpdate({ ...item, updates: [...updates, { text, date: todayISO() }] })} />
          <FileAttach files={item.files}
            onAdd={(f) => onUpdate({ ...item, files: [...(item.files || []), f] })}
            onRemove={(id) => onUpdate({ ...item, files: (item.files || []).filter((f) => f.id !== id) })} />
        </div>
      )}
    </div>
  );
}

/* ---------------- DIRECTORY ---------------- */

function BuildingCard({ b, defaultOpen, onUpdate, onDelete }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [draft, setDraft] = useState(b);
  const [justSaved, setJustSaved] = useState(false);

  const expand = () => { setDraft(b); setJustSaved(false); setOpen(true); };
  const updateAptDraft = (id, patch) => setDraft((d) => ({ ...d, apartments: d.apartments.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const removeAptDraft = (id) => setDraft((d) => ({ ...d, apartments: d.apartments.filter((a) => a.id !== id) }));
  const addAptDraft = () => setDraft((d) => ({ ...d, apartments: [...d.apartments, { id: uid(), number: "", tenantName: "", tenantPhone: "", tenantEmail: "" }] }));
  const save = () => { onUpdate(draft); setJustSaved(true); setTimeout(() => { setOpen(false); }, 500); };
  const cancel = () => { setDraft(b); setOpen(false); };

  if (!open) {
    return (
      <button onClick={expand}
        className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border text-left hover:opacity-90"
        style={{ borderColor: C.hair, backgroundColor: C.card }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <Building2 size={16} color={C.slate} className="shrink-0" />
          <span className="font-semibold truncate" style={{ color: C.ink }}>{b.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {b.zip && <span className="text-xs" style={{ color: C.muted, fontFamily: "'IBM Plex Mono', monospace" }}>{b.zip}</span>}
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: C.muted, backgroundColor: C.paperDark, fontFamily: "'IBM Plex Mono', monospace" }}>
            {b.apartments.length} apt{b.apartments.length === 1 ? "" : "s"}
          </span>
          <ChevronDown size={16} color={C.muted} />
        </div>
      </button>
    );
  }

  return (
    <div className="rounded-lg border-2 overflow-hidden" style={{ borderColor: C.slate, backgroundColor: C.card }}>
      <div className="p-4 flex items-center justify-between gap-3 border-b" style={{ borderColor: C.hair }}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Building2 size={16} color={C.slate} className="shrink-0" />
          <input className={inputCls} style={inputStyle()} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          {draft.zip && <span className="text-xs shrink-0" style={{ color: C.muted, fontFamily: "'IBM Plex Mono', monospace" }}>{draft.zip}</span>}
        </div>
        <Btn size="sm" tone="ghost" icon={Trash2} onClick={() => onDelete(b.id)} />
      </div>
      <div className="px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Apartments</div>
        {draft.officialUnitCount && draft.apartments.length < draft.officialUnitCount && (
          <div className="mb-3 p-2.5 rounded flex items-center justify-between gap-2 flex-wrap" style={{ backgroundColor: C.amberBg }}>
            <div className="text-xs" style={{ color: C.ink }}>NYC public records show {draft.officialUnitCount} units in this building — create the rest as blank slots to fill in?</div>
            <Btn size="sm" onClick={() => setDraft((d) => {
              const missing = d.officialUnitCount - d.apartments.length;
              const blanks = Array.from({ length: missing }, (_, i) => ({ id: uid(), number: `Unit ${d.apartments.length + i + 1}`, tenantName: "", tenantPhone: "", tenantEmail: "" }));
              return { ...d, apartments: [...d.apartments, ...blanks] };
            })}>Create {draft.officialUnitCount - draft.apartments.length} apartments</Btn>
          </div>
        )}
        <div className="flex flex-col gap-2 mb-3">
          {draft.apartments.map((a) => (
            <div key={a.id} className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-2 rounded" style={{ backgroundColor: C.paperDark }}>
              <input className={inputCls} style={inputStyle()} value={a.number} placeholder="Apt #" onChange={(e) => updateAptDraft(a.id, { number: e.target.value })} />
              <input className={inputCls} style={inputStyle()} value={a.tenantName} placeholder="Tenant name" onChange={(e) => updateAptDraft(a.id, { tenantName: e.target.value })} />
              <input className={inputCls} style={inputStyle()} value={a.tenantPhone} placeholder="Phone" onChange={(e) => updateAptDraft(a.id, { tenantPhone: e.target.value })} />
              <input className={inputCls} style={inputStyle()} value={a.tenantEmail} placeholder="Email" onChange={(e) => updateAptDraft(a.id, { tenantEmail: e.target.value })} />
              <Btn size="sm" tone="ghost" icon={Trash2} onClick={() => removeAptDraft(a.id)}>Remove</Btn>
            </div>
          ))}
          {draft.apartments.length === 0 && <div className="text-sm italic" style={{ color: C.muted }}>No apartments added yet.</div>}
        </div>
        <Btn size="sm" tone="ghost" icon={Plus} onClick={addAptDraft}>Add apartment row</Btn>

        <div className="flex items-center gap-2 justify-end pt-4 mt-3 border-t" style={{ borderColor: C.hair }}>
          {justSaved && <span className="text-sm mr-auto flex items-center gap-1" style={{ color: C.green }}><CheckCircle2 size={15} /> Saved</span>}
          <Btn tone="ghost" onClick={cancel}>Cancel</Btn>
          <Btn tone="green" icon={CheckCircle2} onClick={save}>Save building &amp; apartments</Btn>
        </div>
      </div>
    </div>
  );
}

function ContractorCard({ c, onUpdate, onDelete }) {
  return (
    <div className="rounded-lg border p-4 grid grid-cols-1 sm:grid-cols-4 gap-2 items-center" style={{ borderColor: C.hair, backgroundColor: C.card }}>
      <div className="flex items-center gap-2 sm:col-span-1">
        <Users size={15} color={C.slate} />
        <input className="font-semibold bg-transparent border-none focus:outline-none w-full" style={{ color: C.ink }} value={c.name} onChange={(e) => onUpdate({ ...c, name: e.target.value })} />
      </div>
      <input className={inputCls} style={inputStyle()} placeholder="Phone" value={c.phone} onChange={(e) => onUpdate({ ...c, phone: e.target.value })} />
      <input className={inputCls} style={inputStyle()} placeholder="Email" value={c.email} onChange={(e) => onUpdate({ ...c, email: e.target.value })} />
      <Btn size="sm" tone="ghost" icon={Trash2} onClick={() => onDelete(c.id)}>Remove</Btn>
    </div>
  );
}

// Turnaround time (assigned → completed) and average paid invoice amount,
// per vendor — pulled from every work order/task they've touched and every
// invoice billed under their name.
function vendorStats(contractors, workorders, invoices) {
  return contractors.map((c) => {
    const durations = [];
    workorders.forEach((w) => {
      const tasks = w.tasks || [];
      if (tasks.length === 0) {
        if (w.contractorId === c.id && w.assignedDate && w.dateResolved) {
          const d = daysBetween(w.assignedDate, w.dateResolved);
          if (d >= 0) durations.push(d); // a negative gap means bad/manually-backdated data — skip it rather than show a nonsense average
        }
      } else {
        tasks.forEach((t) => {
          if (t.contractorId === c.id && t.assignedDate && t.completedDate) {
            const d = daysBetween(t.assignedDate, t.completedDate);
            if (d >= 0) durations.push(d);
          }
        });
      }
    });
    const avgDays = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
    const paidInvoices = invoices.filter((i) => i.contractorId === c.id && i.status === "paid");
    const totalPaid = paidInvoices.reduce((a, i) => a + Number(i.amount), 0);
    const avgInvoice = paidInvoices.length ? totalPaid / paidInvoices.length : null;
    return { contractor: c, jobsCompleted: durations.length, avgDays, avgInvoice, totalPaid, invoiceCount: paidInvoices.length };
  }).sort((a, b) => b.totalPaid - a.totalPaid);
}

// Every open work order (or open vendor task within a split job) currently
// sitting with this contractor — used for both the "Open work orders" list
// and the notify message.
function vendorOpenItems(contractorId, workorders) {
  const items = [];
  workorders.forEach((w) => {
    const tasks = w.tasks || [];
    if (tasks.length === 0) {
      if (w.contractorId === contractorId && w.status !== "resolved") {
        items.push({ workOrder: w, description: w.issue });
      }
    } else {
      tasks.forEach((t) => {
        if (t.contractorId === contractorId && t.status !== "completed") items.push({ workOrder: w, description: t.description });
      });
    }
  });
  return items;
}

function VendorCard({ stat, workorders, buildings }) {
  const s = stat;
  const [expanded, setExpanded] = useState(false);
  const [showNotify, setShowNotify] = useState(false);
  const [copied, setCopied] = useState(false);
  const openItems = vendorOpenItems(s.contractor.id, workorders);

  const itemLine = (item) => {
    const b = lookupBuilding(buildings, item.workOrder.buildingId);
    const apt = lookupApartment(buildings, item.workOrder.buildingId, item.workOrder.apartmentId);
    const tenant = apt?.tenantName ? ` — Tenant: ${apt.tenantName}${apt.tenantPhone ? ` (${apt.tenantPhone})` : ""}` : "";
    return `#${item.workOrder.number ?? "—"} — ${b?.name || "No building"}${apt ? ` Apt ${apt.number}` : ""}: ${item.description}${tenant}`;
  };

  const message = `Hi ${s.contractor.name}, below are all open work orders, please advise on the status:\n\n${openItems.map((i) => `- ${itemLine(i)}`).join("\n")}`;

  const copyMsg = async () => {
    try { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: C.hair, backgroundColor: C.card }}>
      <div className="font-semibold mb-2 flex items-center gap-2" style={{ color: C.ink }}>
        <Users size={15} color={C.slate} /> {s.contractor.name}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Jobs completed</div>
          <div className="font-semibold" style={{ color: C.ink, fontFamily: "'IBM Plex Mono', monospace" }}>{s.jobsCompleted}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Avg. turnaround</div>
          <div className="font-semibold" style={{ color: C.ink, fontFamily: "'IBM Plex Mono', monospace" }}>{s.avgDays != null ? `${s.avgDays.toFixed(1)}d` : "—"}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Avg. invoice</div>
          <div className="font-semibold" style={{ color: C.ink, fontFamily: "'IBM Plex Mono', monospace" }}>{s.avgInvoice != null ? `$${s.avgInvoice.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide" style={{ color: C.muted }}>Total paid</div>
          <div className="font-semibold" style={{ color: C.ink, fontFamily: "'IBM Plex Mono', monospace" }}>${s.totalPaid.toLocaleString()}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t" style={{ borderColor: C.hair }}>
        <Btn size="sm" tone="ghost" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Hide" : "Show"} open work orders ({openItems.length})
        </Btn>
        {openItems.length > 0 && (
          <Btn size="sm" tone="amber" icon={MessageCircle} onClick={() => setShowNotify(!showNotify)}>Notify contractor</Btn>
        )}
      </div>

      {expanded && (
        <div className="mt-3 flex flex-col gap-1.5">
          {openItems.length === 0 && <div className="text-sm italic" style={{ color: C.muted }}>No open work orders.</div>}
          {openItems.map((item, i) => (
            <div key={i} className="text-sm p-2 rounded" style={{ backgroundColor: C.paperDark, color: C.ink }}>{itemLine(item)}</div>
          ))}
        </div>
      )}

      {showNotify && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: C.hair }}>
          <div className="text-sm whitespace-pre-wrap p-2.5 rounded" style={{ backgroundColor: C.paperDark, color: C.ink }}>{message}</div>
          <div className="mt-2"><Btn size="sm" tone="ghost" icon={Copy} onClick={copyMsg}>{copied ? "Copied" : "Copy message"}</Btn></div>
          <div className="text-xs mt-1.5" style={{ color: C.muted }}>Copies to your clipboard — paste it into Messages to {s.contractor.phone || "your contractor"}.</div>
        </div>
      )}
    </div>
  );
}

function VendorsTab({ contractors, workorders, invoices, buildings }) {
  const [search, setSearch] = useState("");
  const stats = vendorStats(contractors, workorders, invoices);
  if (contractors.length === 0) return <Empty text="No contractors yet — add some in the Directory tab." />;
  const q = search.trim().toLowerCase();
  const filtered = q ? stats.filter((s) => s.contractor.name.toLowerCase().includes(q)) : stats;
  return (
    <div className="flex flex-col gap-3">
      {contractors.length > 1 && <SearchBar value={search} onChange={setSearch} placeholder="Search vendors..." />}
      {filtered.length === 0 && <Empty text="No vendors match your search." />}
      {filtered.map((s) => (
        <VendorCard key={s.contractor.id} stat={s} workorders={workorders} buildings={buildings} />
      ))}
    </div>
  );
}

function DirectoryTab({ buildings, contractors, buildingsPersist, contractorsPersist }) {
  const [view, setView] = useState("buildings");
  const [newBuilding, setNewBuilding] = useState("");
  const [buildingSearch, setBuildingSearch] = useState("");
  const [newContractor, setNewContractor] = useState({ name: "", phone: "", email: "" });
  const [justAddedId, setJustAddedId] = useState(null);
  const [addressMatches, setAddressMatches] = useState([]);
  const [addressBusy, setAddressBusy] = useState(false);
  const [staged, setStaged] = useState({ zip: "", units: null });

  // Looks up what you're typing against NYC public property records after a
  // short pause, so it doesn't fire on every keystroke.
  useEffect(() => {
    if (newBuilding.trim().length < 5) { setAddressMatches([]); return; }
    const t = setTimeout(async () => {
      setAddressBusy(true);
      const results = await lookupNycAddress(newBuilding);
      setAddressMatches(results);
      setAddressBusy(false);
    }, 500);
    return () => clearTimeout(t);
  }, [newBuilding]);

  const pickMatch = (m) => {
    setNewBuilding(m.address);
    setStaged({ zip: m.zip, units: m.units });
    setAddressMatches([]);
  };

  const addBuilding = () => {
    if (!newBuilding.trim()) return;
    const b = { id: uid(), name: newBuilding.trim(), zip: staged.zip || "", officialUnitCount: staged.units || null, apartments: [] };
    buildingsPersist([...buildings, b]);
    setNewBuilding(""); setStaged({ zip: "", units: null }); setAddressMatches([]);
    setJustAddedId(b.id);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Btn tone={view === "buildings" ? "slate" : "ghost"} icon={Building2} onClick={() => setView("buildings")}>Buildings</Btn>
        <Btn tone={view === "contractors" ? "slate" : "ghost"} icon={Users} onClick={() => setView("contractors")}>Contractors</Btn>
      </div>

      {view === "buildings" && (
        <>
          <div className="relative">
            <div className="flex gap-2">
              <input className={inputCls} style={inputStyle()} placeholder="Start typing a NYC address..." value={newBuilding}
                onChange={(e) => { setNewBuilding(e.target.value); setStaged({ zip: "", units: null }); }}
                onKeyDown={(e) => { if (e.key === "Enter") addBuilding(); }} />
              <Btn icon={Plus} onClick={addBuilding}>Add building</Btn>
            </div>
            {addressBusy && <div className="text-xs mt-1" style={{ color: C.muted }}>Checking NYC public records...</div>}
            {addressMatches.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border overflow-hidden" style={{ backgroundColor: C.card, borderColor: C.hair }}>
                {addressMatches.map((m, i) => (
                  <button key={i} onClick={() => pickMatch(m)} className="block w-full text-left px-3 py-2 text-sm hover:opacity-75 border-b last:border-b-0" style={{ color: C.ink, borderColor: C.hair }}>
                    {m.address}{m.borough ? `, ${m.borough}` : ""}{m.zip ? ` — ${m.zip}` : ""}{m.units ? ` — ${m.units} units` : ""}
                  </button>
                ))}
              </div>
            )}
            {staged.zip && (
              <div className="text-xs mt-1" style={{ color: C.green }}>
                Matched: ZIP {staged.zip}{staged.units ? `, ${staged.units} units on record` : ""} — will fill in when you add it.
              </div>
            )}
          </div>
          {buildings.length > 1 && (
            <SearchBar value={buildingSearch} onChange={setBuildingSearch} placeholder="Jump to a building — search by name or address..." />
          )}
          {buildings.length === 0 && <Empty text="No buildings yet. Start typing an address above, fill in its units, then collapse it." />}
          {(() => {
            const q = buildingSearch.trim().toLowerCase();
            const filtered = q ? buildings.filter((b) => (b.name || "").toLowerCase().includes(q)) : buildings;
            if (buildings.length > 0 && filtered.length === 0) return <Empty text="No buildings match your search." />;
            return sortBuildings(filtered).map((b) => (
              <BuildingCard key={b.id} b={b} defaultOpen={b.id === justAddedId}
                onUpdate={(next) => buildingsPersist(buildings.map((x) => (x.id === next.id ? next : x)))}
                onDelete={(id) => buildingsPersist(buildings.filter((x) => x.id !== id))} />
            ));
          })()}
        </>
      )}

      {view === "contractors" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input className={inputCls} style={inputStyle()} placeholder="Name" value={newContractor.name} onChange={(e) => setNewContractor({ ...newContractor, name: e.target.value })} />
            <input className={inputCls} style={inputStyle()} placeholder="Phone" value={newContractor.phone} onChange={(e) => setNewContractor({ ...newContractor, phone: e.target.value })} />
            <input className={inputCls} style={inputStyle()} placeholder="Email" value={newContractor.email} onChange={(e) => setNewContractor({ ...newContractor, email: e.target.value })} />
            <Btn icon={Plus} onClick={() => { if (!newContractor.name.trim()) return; contractorsPersist([...contractors, { id: uid(), ...newContractor, name: newContractor.name.trim() }]); setNewContractor({ name: "", phone: "", email: "" }); }}>Add contractor</Btn>
          </div>
          {contractors.length === 0 && <Empty text="No contractors yet." />}
          {contractors.map((c) => (
            <ContractorCard key={c.id} c={c}
              onUpdate={(next) => contractorsPersist(contractors.map((x) => (x.id === next.id ? next : x)))}
              onDelete={(id) => contractorsPersist(contractors.filter((x) => x.id !== id))} />
          ))}
        </>
      )}
    </div>
  );
}

/* ---------------- BOSS VIEW ---------------- */

function BossInvoiceCard({ inv, onUpdate }) {
  const [showChat, setShowChat] = useState((inv.messages || []).length > 0);
  const [preview, setPreview] = useState(null);
  const messages = inv.messages || [];
  const stamp = inv.status === "approved" ? <Stamp tone="green">Approved</Stamp> :
    inv.status === "declined" ? <Stamp tone="red">Declined</Stamp> : <Stamp tone="slate">Awaiting your review</Stamp>;

  const sendMessage = (text) => onUpdate({ ...inv, messages: [...messages, { from: "boss", text, date: todayISO() }] });

  return (
    <div className="rounded-xl border-2 p-4" style={{ borderColor: C.hair, backgroundColor: C.card }}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-xs font-semibold mb-1" style={{ color: C.muted, fontFamily: "'IBM Plex Mono', monospace" }}>Invoice #{inv.number ?? "—"}</div>
          <div className="text-lg font-bold" style={{ color: C.ink }}>{inv.contractorName || "Unassigned vendor"}</div>
          <div className="text-sm mt-0.5" style={{ color: C.muted }}>{inv.buildingName || "No building"} · {fmtDate(inv.date)}</div>
        </div>
        {stamp}
      </div>
      <div className="text-xl font-bold" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.ink }}>${Number(inv.amount).toLocaleString()}</div>
      <NegotiatedPriceBox amount={inv.amount}
        onChange={(newAmount, historyEntry) => onUpdate({ ...inv, amount: newAmount, history: [...(inv.history || []), historyEntry] })} />
      <div className="text-base mb-4" style={{ color: C.ink }}>{inv.description}</div>

      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => onUpdate({ ...inv, status: "approved" })}
          className="flex flex-col items-center gap-1 py-3 rounded-lg font-semibold text-white"
          style={{ backgroundColor: C.green }}>
          <Check size={22} /> Approve
        </button>
        <button onClick={() => onUpdate({ ...inv, status: "declined" })}
          className="flex flex-col items-center gap-1 py-3 rounded-lg font-semibold text-white"
          style={{ backgroundColor: C.red }}>
          <X size={22} /> Decline
        </button>
        <button onClick={() => setShowChat(!showChat)}
          className="flex flex-col items-center gap-1 py-3 rounded-lg font-semibold text-white relative"
          style={{ backgroundColor: C.amber }}>
          <HelpCircle size={22} /> Question
          {messages.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-[11px] flex items-center justify-center font-bold"
              style={{ backgroundColor: C.red, color: "#fff" }}>{messages.length}</span>
          )}
        </button>
      </div>
      <HistoryLog history={inv.history} />
      {(inv.photos || []).length > 0 && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: C.hair }}>
          <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Photos</div>
          <div className="flex gap-2 flex-wrap">
            {inv.photos.map((p) => (
              <img key={p.id} src={p.dataUrl} alt={p.name} onClick={() => setPreview(p.dataUrl)}
                className="w-20 h-20 object-cover rounded-md border cursor-pointer" style={{ borderColor: C.hair }} />
            ))}
          </div>
          <PhotoLightbox src={preview} onClose={() => setPreview(null)} />
        </div>
      )}
      {showChat && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: C.hair }}>
          <MessageThread messages={messages} onSend={sendMessage} sendAs="boss" placeholder="Type your question..." />
        </div>
      )}
    </div>
  );
}

function BossView({ invoices, onUpdate, onExit, standalone }) {
  const pending = invoices.filter((i) => i.status === "pending");
  const reviewed = invoices.filter((i) => i.status === "approved" || i.status === "declined");
  const paid = invoices.filter((i) => i.status === "paid");
  return (
    <div className="min-h-screen" style={{ backgroundColor: C.paper, fontFamily: "'IBM Plex Sans', system-ui, sans-serif", color: C.ink }}>
      <header className="px-3 sm:px-5 pt-3 pb-2 border-b flex items-center justify-between" style={{ borderColor: C.hair }}>
        <div className="flex items-center gap-3">
          <Logo height={24} />
          <h1 className="text-lg font-bold">Invoices to review</h1>
        </div>
        {!standalone && <button onClick={onExit} className="text-xs underline" style={{ color: C.muted }}>Exit</button>}
      </header>
      <main className="px-3 sm:px-5 py-3 max-w-lg mx-auto flex flex-col gap-2">
        {pending.length === 0 && reviewed.length === 0 && paid.length === 0 && <Empty text="No invoices yet." />}
        {pending.length === 0 && (reviewed.length > 0 || paid.length > 0) && (
          <div className="text-center py-6" style={{ color: C.muted }}>Nothing waiting on you right now.</div>
        )}
        {pending.map((inv) => (
          <BossInvoiceCard key={inv.id} inv={inv} onUpdate={onUpdate} />
        ))}

        <CollapsibleSection label="Already reviewed" count={reviewed.length}>
          {reviewed.map((inv) => {
            const stamp = inv.status === "approved" ? <Stamp tone="green">Approved</Stamp> : <Stamp tone="red">Declined</Stamp>;
            return (
              <div key={inv.id} className="flex items-center justify-between gap-2 p-3 rounded-lg border" style={{ borderColor: C.hair, backgroundColor: C.card }}>
                <div className="text-sm" style={{ color: C.ink }}>{inv.contractorName || "Vendor"} — ${Number(inv.amount).toLocaleString()}</div>
                {stamp}
              </div>
            );
          })}
        </CollapsibleSection>

        <CollapsibleSection label="Paid invoices" count={paid.length}>
          {paid.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between gap-2 p-3 rounded-lg border" style={{ borderColor: C.hair, backgroundColor: C.card }}>
              <div className="text-sm" style={{ color: C.ink }}>{inv.contractorName || "Vendor"} — ${Number(inv.amount).toLocaleString()}</div>
              <Stamp tone="green">Paid</Stamp>
            </div>
          ))}
        </CollapsibleSection>
      </main>
    </div>
  );
}
/* ---------------- ROOT ---------------- */

function Dashboard({ onSignOut }) {
  useFonts();
  useEffect(() => { document.title = "Abeco Management — Ops Board"; }, []);
  const authReady = true; // already confirmed as a real, logged-in user by MainApp below
  const [tab, setTab] = useState("invoices");
  const [showForm, setShowForm] = useState(false);
  const [bossMode, setBossMode] = useState(false);
  const [showUnlockSetup, setShowUnlockSetup] = useState(false);
  const [showBossPinSettings, setShowBossPinSettings] = useState(false);
  const [jumpToId, setJumpToId] = useState("");
  const [jumpToPaid, setJumpToPaid] = useState(false);
  const [jumpToDeclined, setJumpToDeclined] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [workOrderSearch, setWorkOrderSearch] = useState("");
  const [emergencySearch, setEmergencySearch] = useState("");
  const invoiceCardRefs = useRef({});

  const [invoices, saveInvoice, deleteInvoice, invReady] = useCollectionSynced("invoices", authReady);
  const [violations, violationsPersist, vioReady] = useSynced("violations", authReady, []);
  const [workorders, saveWorkOrder, deleteWorkOrder, wkReady] = useCollectionSynced("workorders", authReady);
  const [emergencies, saveEmergency, deleteEmergency, emReady] = useCollectionSynced("emergencies", authReady);
  const [contractors, contractorsPersist, conReady] = useSynced("contractors", authReady, SEED_CONTRACTORS);
  const [buildings, buildingsPersist, bldReady] = useSynced("buildings", authReady, []);

  const loading = !authReady || !invReady || !vioReady || !wkReady || !emReady || !conReady || !bldReady;
  const emQuery = emergencySearch.trim().toLowerCase();
  const emergencySearchText = (item) => {
    const building = lookupBuilding(buildings, item.buildingId);
    const apartment = lookupApartment(buildings, item.buildingId, item.apartmentId);
    const updatesText = (item.updates || []).map((u) => u.text).join(" ");
    return [item.title, building?.name, apartment?.number, updatesText].filter(Boolean).join(" ").toLowerCase();
  };
  const activeEmergencies = emergencies.filter((e) => e.status !== "resolved" && (!emQuery || emergencySearchText(e).includes(emQuery)));
  const resolvedEmergencies = emergencies.filter((e) => e.status === "resolved" && (!emQuery || emergencySearchText(e).includes(emQuery)));

  // One-time backfill: invoices created before vendor/building names were
  // snapshotted onto them get filled in now, so your boss's view (which can
  // no longer read contractors/buildings at all) shows the right name
  // instead of "Unassigned."
  useEffect(() => {
    if (!invReady || !conReady || !bldReady) return;
    invoices.forEach((inv) => {
      if (!inv.contractorName && !inv.buildingName) {
        const contractorName = lookupContractor(contractors, inv.contractorId)?.name || "";
        const buildingName = lookupBuilding(buildings, inv.buildingId)?.name || "";
        if (contractorName || buildingName) saveInvoice({ ...inv, contractorName, buildingName });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invReady, conReady, bldReady]);

  const addContractor = (c) => contractorsPersist([...contractors, c]);

  const pendingInvoices = invoices.filter((i) => i.status === "pending").length;
  const dueViolations = violations.filter((v) => v.status !== "resolved" && daysBetween(todayISO(), v.cureDate) <= 7);
  const openWorkOrders = workorders.filter((w) => w.status !== "resolved").length;

  const invQuery = invoiceSearch.trim().toLowerCase();
  const activeInvoices = invoices.filter((i) => i.status !== "paid" && i.status !== "declined" && (!invQuery || invoiceSearchText(i, contractors, buildings).includes(invQuery)));
  const paidInvoices = invoices.filter((i) => i.status === "paid" && (!invQuery || invoiceSearchText(i, contractors, buildings).includes(invQuery)));
  const declinedInvoices = invoices.filter((i) => i.status === "declined" && (!invQuery || invoiceSearchText(i, contractors, buildings).includes(invQuery)));

  const woQuery = workOrderSearch.trim().toLowerCase();
  const activeWorkOrders = workorders.filter((w) => w.status !== "resolved" && (!woQuery || workOrderSearchText(w, contractors, buildings).includes(woQuery)));
  const completedWorkOrders = workorders.filter((w) => w.status === "resolved" && (!woQuery || workOrderSearchText(w, contractors, buildings).includes(woQuery)));

  const tabs = [
    { id: "workorders", label: "Work Orders", icon: Wrench, count: openWorkOrders },
    { id: "violations", label: "HPD Violations", icon: ShieldAlert, count: dueViolations.length },
    { id: "emergencies", label: "911", icon: AlertTriangle, count: activeEmergencies.length },
    { id: "invoices", label: "Invoices", icon: FileText, count: pendingInvoices },
    { id: "directory", label: "Directory", icon: Building2, count: 0 },
    { id: "vendors", label: "Vendors", icon: Users, count: 0 },
  ];

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.paper }}><Loader2 className="animate-spin" color={C.slate} size={28} /></div>;
  }

  if (bossMode) {
    return <BossView invoices={invoices} onUpdate={saveInvoice} onExit={() => setBossMode(false)} />;
  }
  return (
    <div className="min-h-screen" style={{ backgroundColor: C.paper, fontFamily: "'IBM Plex Sans', system-ui, sans-serif", color: C.ink }}>
      <header className="px-3 sm:px-5 pt-3 pb-2 border-b" style={{ borderColor: C.hair }}>
        <div className="max-w-3xl mx-auto flex items-end justify-between">
          <div className="flex items-center gap-3">
            <Logo height={26} />
            <div>
              <div className="text-xs uppercase tracking-widest font-semibold" style={{ color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>Abeco Management</div>
              <h1 className="text-lg font-bold mt-0.5">Ops Board</h1>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex gap-1.5">
              <button onClick={() => setBossMode(true)} className="text-xs px-2.5 py-1 rounded-md border font-medium" style={{ borderColor: C.hair, color: C.slate }}>
                Preview Boss View
              </button>
              <button onClick={() => setShowUnlockSetup(true)} className="text-xs px-2.5 py-1 rounded-md border font-medium" style={{ borderColor: C.hair, color: C.slate }}>
                Quick Unlock
              </button>
              <button onClick={() => setShowBossPinSettings(true)} className="text-xs px-2.5 py-1 rounded-md border font-medium" style={{ borderColor: C.hair, color: C.slate }}>
                Boss PIN
              </button>
              <button onClick={onSignOut} className="text-xs px-2.5 py-1 rounded-md border font-medium" style={{ borderColor: C.hair, color: C.muted }}>
                Sign out
              </button>
            </div>
            <div className="text-xs hidden sm:block" style={{ color: C.muted, fontFamily: "'IBM Plex Mono', monospace" }}>{fmtDate(todayISO())}</div>
          </div>
        </div>
      </header>
      {showUnlockSetup && <QuickUnlockSetup onClose={() => setShowUnlockSetup(false)} />}
      {showBossPinSettings && <BossPinSettings onClose={() => setShowBossPinSettings(false)} />}

      <nav className="px-3 sm:px-5 pt-2">
        <div className="max-w-3xl mx-auto flex gap-2 flex-wrap">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setShowForm(false); }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium border"
              style={{ backgroundColor: tab === t.id ? C.slate : C.card, color: tab === t.id ? "#fff" : C.ink, borderColor: tab === t.id ? C.slate : C.hair }}>
              <t.icon size={15} />{t.label}
              {t.count > 0 && (
                <span className="text-[11px] px-1.5 rounded-full font-semibold" style={{ backgroundColor: tab === t.id ? "rgba(255,255,255,0.25)" : C.redBg, color: tab === t.id ? "#fff" : C.red, fontFamily: "'IBM Plex Mono', monospace" }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <main className="px-3 sm:px-5 py-3">
        <div className="max-w-3xl mx-auto flex flex-col gap-3">
          {tab === "violations" && dueViolations.length > 0 && (
            <div className="rounded-lg p-3 flex items-start gap-2 border" style={{ backgroundColor: C.redBg, borderColor: C.red }}>
              <AlertTriangle size={16} color={C.red} className="mt-0.5 shrink-0" />
              <div className="text-sm" style={{ color: C.ink }}>
                <span className="font-semibold">{dueViolations.length} violation{dueViolations.length > 1 ? "s" : ""} due within 7 days.</span>{" "}
                This board reminds you when you open it — no push notifications — so check back before cure dates.
              </div>
            </div>
          )}

          {(tab === "invoices" || tab === "violations" || tab === "workorders" || tab === "emergencies") && (
            <div className="flex justify-end">
              <Btn icon={showForm ? X : Plus} onClick={() => setShowForm(!showForm)}>
                {showForm ? "Close" : tab === "invoices" ? "New invoice" : tab === "violations" ? "New violation" : tab === "emergencies" ? "New 911" : "New work order"}
              </Btn>
            </div>
          )}

          {showForm && tab === "invoices" && (
            <InvoiceForm contractors={contractors} buildings={buildings} workorders={workorders} violations={violations} invoices={invoices} onCreateContractor={addContractor}
              onCancel={() => setShowForm(false)}
              onSave={async (inv) => {
                const number = await getNextInvoiceNumber();
                // Snapshot the vendor and building names directly onto the
                // invoice — so your boss's view never has to read the
                // contractors/buildings data at all, only invoices.
                const contractorName = lookupContractor(contractors, inv.contractorId)?.name || "";
                const buildingName = lookupBuilding(buildings, inv.buildingId)?.name || "";
                await saveInvoice({ ...inv, number, contractorName, buildingName });
                setShowForm(false);
              }} />
          )}
          {showForm && tab === "violations" && (
            <ViolationForm contractors={contractors} buildings={buildings} onCreateContractor={addContractor}
              onCancel={() => setShowForm(false)} onSave={(v) => { violationsPersist([v, ...violations]); setShowForm(false); }} />
          )}
          {showForm && tab === "workorders" && (
            <WorkOrderForm contractors={contractors} buildings={buildings} onCreateContractor={addContractor}
              onCancel={() => setShowForm(false)}
              onSave={async (w) => {
                const number = await getNextWorkOrderNumber();
                await saveWorkOrder({ ...w, number });
                setShowForm(false);
              }} />
          )}
          {showForm && tab === "emergencies" && (
            <EmergencyForm buildings={buildings}
              onCancel={() => setShowForm(false)}
              onSave={(item) => { saveEmergency(item); setShowForm(false); }} />
          )}

          {tab === "invoices" && invoices.length > 0 && (
            <>
              <SearchBar value={invoiceSearch} onChange={setInvoiceSearch} placeholder="Search by vendor, building, apartment, tenant, phone, description..." />
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium uppercase tracking-wide shrink-0" style={{ color: C.muted }}>Jump to invoice</label>
                <select className={selectCls} style={inputStyle()} value={jumpToId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setJumpToId(id);
                    const target = invoices.find((i) => i.id === id);
                    if (target?.status === "paid") setJumpToPaid(true);
                    if (target?.status === "declined") setJumpToDeclined(true);
                    if (id) setTimeout(() => invoiceCardRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
                  }}>
                  <option value="">Select invoice #...</option>
                  {[...invoices].sort((a, b) => (b.number ?? 0) - (a.number ?? 0)).map((inv) => {
                    const contractor = lookupContractor(contractors, inv.contractorId);
                    return <option key={inv.id} value={inv.id}>#{inv.number ?? "—"} — {contractor?.name || "Unassigned"} — ${Number(inv.amount).toLocaleString()}</option>;
                  })}
                </select>
              </div>
              <div className="flex gap-2">
                <InvoicePrintButton activeItems={activeInvoices} paidItems={paidInvoices} declinedItems={declinedInvoices} columns={invoiceColumns(contractors, buildings)} />
              </div>
            </>
          )}

          {tab === "invoices" && (activeInvoices.length === 0 && paidInvoices.length === 0 ? <Empty text="No invoices yet. Add one to start approving." /> :
            <>
              {activeInvoices.length === 0 && invoices.length > 0 && (
                <Empty text={invoiceSearch.trim() ? "No invoices match your search." : "No open invoices — check Paid invoices below."} />
              )}
              {sortByBuilding(activeInvoices, buildings).map((inv) => <InvoiceCard key={inv.id} inv={inv} contractors={contractors} buildings={buildings} workorders={workorders} violations={violations}
                cardRef={(el) => (invoiceCardRefs.current[inv.id] = el)}
                forceOpenId={jumpToId}
                onUpdate={saveInvoice}
                onDelete={deleteInvoice} />)}
              <CollapsibleSection label="Paid invoices" count={paidInvoices.length} forceOpen={jumpToPaid}>
                {sortByBuilding(paidInvoices, buildings).map((inv) => <InvoiceCard key={inv.id} inv={inv} contractors={contractors} buildings={buildings} workorders={workorders} violations={violations}
                  cardRef={(el) => (invoiceCardRefs.current[inv.id] = el)}
                  forceOpenId={jumpToId}
                  onUpdate={saveInvoice}
                  onDelete={deleteInvoice} />)}
              </CollapsibleSection>
              <CollapsibleSection label="Declined invoices" count={declinedInvoices.length} forceOpen={jumpToDeclined}>
                {sortByBuilding(declinedInvoices, buildings).map((inv) => <InvoiceCard key={inv.id} inv={inv} contractors={contractors} buildings={buildings} workorders={workorders} violations={violations}
                  cardRef={(el) => (invoiceCardRefs.current[inv.id] = el)}
                  forceOpenId={jumpToId}
                  onUpdate={saveInvoice}
                  onDelete={deleteInvoice} />)}
              </CollapsibleSection>
            </>
          )}

          {tab === "violations" && (violations.length === 0 ? <Empty text="No violations tracked yet." /> :
            [...violations].sort((a, b) => (a.status === "resolved") - (b.status === "resolved") || a.cureDate.localeCompare(b.cureDate)).map((v) => (
              <ViolationCard key={v.id} v={v} contractors={contractors} buildings={buildings} onCreateContractor={addContractor}
                onUpdate={(next) => violationsPersist(violations.map((x) => (x.id === next.id ? next : x)))}
                onDelete={(id) => violationsPersist(violations.filter((x) => x.id !== id))} />
            )))}

          {tab === "workorders" && workorders.length > 0 && (
            <>
              <SearchBar value={workOrderSearch} onChange={setWorkOrderSearch} placeholder="Search by tenant, building, apartment, phone, vendor, issue..." />
              <div className="flex gap-2">
                <PrintButton title="Work Orders" openItems={activeWorkOrders} closedItems={completedWorkOrders} closedLabel="Completed" columns={workOrderColumns(contractors, buildings)} />
              </div>
            </>
          )}

          {tab === "workorders" && (activeWorkOrders.length === 0 && completedWorkOrders.length === 0 ? <Empty text="No work orders yet." /> :
            <>
              {activeWorkOrders.length === 0 && workorders.length > 0 && (
                <Empty text={workOrderSearch.trim() ? "No work orders match your search." : "No open work orders — check Completed work orders below."} />
              )}
              {sortByBuilding(activeWorkOrders, buildings).map((w) => <WorkOrderCard key={w.id} w={w} contractors={contractors} buildings={buildings} onCreateContractor={addContractor}
                onUpdate={saveWorkOrder}
                onDelete={deleteWorkOrder} />)}
              <CollapsibleSection label="Completed work orders" count={completedWorkOrders.length}>
                {sortByBuilding(completedWorkOrders, buildings).map((w) => <WorkOrderCard key={w.id} w={w} contractors={contractors} buildings={buildings} onCreateContractor={addContractor}
                  onUpdate={saveWorkOrder}
                  onDelete={deleteWorkOrder} />)}
              </CollapsibleSection>
            </>
          )}

          {tab === "emergencies" && emergencies.length > 0 && (
            <>
              <SearchBar value={emergencySearch} onChange={setEmergencySearch} placeholder="Search by title, building, or anything in the updates..." />
              <div className="flex gap-2">
                <EmergencyPrintButton openItems={activeEmergencies} closedItems={resolvedEmergencies} buildings={buildings} />
              </div>
            </>
          )}

          {tab === "emergencies" && (activeEmergencies.length === 0 && resolvedEmergencies.length === 0 ? <Empty text={emergencies.length === 0 ? "No 911s right now." : "No 911s match your search."} /> :
            <>
              {sortByBuilding(activeEmergencies, buildings).map((item) => (
                <EmergencyCard key={item.id} item={item} buildings={buildings} onUpdate={saveEmergency} onDelete={deleteEmergency} />
              ))}
              <CollapsibleSection label="Resolved 911s" count={resolvedEmergencies.length}>
                {sortByBuilding(resolvedEmergencies, buildings).map((item) => (
                  <EmergencyCard key={item.id} item={item} buildings={buildings} onUpdate={saveEmergency} onDelete={deleteEmergency} />
                ))}
              </CollapsibleSection>
            </>
          )}

          {tab === "directory" && (
            <DirectoryTab buildings={buildings} contractors={contractors} buildingsPersist={buildingsPersist} contractorsPersist={contractorsPersist} />
          )}

          {tab === "vendors" && (
            <VendorsTab contractors={contractors} workorders={workorders} invoices={invoices} buildings={buildings} />
          )}
        </div>
      </main>
    </div>
  );
}

function Empty({ text }) {
  return <div className="text-center py-10 rounded-lg border border-dashed" style={{ borderColor: C.hair, color: C.muted }}>{text}</div>;
}

// Gate in front of the real dashboard — requires an actual signed-in
// (non-anonymous) account. If nobody's logged in, shows the login screen
// instead of the app.
// Re-locks (requiring the PIN/Face ID screen again) any time you leave the
// app — switch tabs, background it, turn the phone screen off — rather
// than on a fixed timer. This never signs you out of the underlying
// Firebase session, so it's just the quick-unlock screen next time, never
// your email and password again. Only active once a PIN has been set up.
function useLockOnBackground(active, onLock) {
  useEffect(() => {
    if (!active) return;
    const handler = () => { if (document.visibilityState === "hidden") onLock(); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [active, onLock]);
}

function MainApp() {
  const { user, checked } = useRealAuth();
  const [unlocked, setUnlocked] = useState(false);
  const [pinHash, setPinHash] = useState(undefined); // undefined = still checking, null = none set

  useLockOnBackground(!!user && !!pinHash, () => setUnlocked(false));

  useEffect(() => {
    if (!user) return;
    getAdminPinHash().then(setPinHash);
  }, [user]);

  if (!checked) {
    return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.paper }}><Loader2 className="animate-spin" color={C.slate} size={28} /></div>;
  }
  if (!user) return <LoginScreen />;
  if (pinHash === undefined) {
    return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.paper }}><Loader2 className="animate-spin" color={C.slate} size={28} /></div>;
  }
  if (pinHash && !unlocked) return <LockScreen pinHash={pinHash} onUnlock={() => setUnlocked(true)} />;
  return <Dashboard onSignOut={() => signOut(auth)} />;
}

/* ---------------- BOSS-ONLY LINK ---------------- */
// Visiting /boss loads ONLY this component — it never fetches or renders
// violations, work orders, or the directory, and there is no way to
// navigate to the rest of the app from here.

// Separate PIN from your own Quick Unlock PIN — protects the invoice page
// specifically. You set this yourself from your dashboard (see
// BossPinSettings below); it's stored centrally in Firestore, so it
// applies no matter which device your boss opens the link on — not
// per-device like your own PIN.
async function getBossPinHash() {
  try {
    const snap = await getDoc(doc(db, "settings", "bossPin"));
    return snap.exists() ? snap.data().hash : null;
  } catch (e) {
    console.error("Failed to read boss PIN:", e);
    return null;
  }
}
async function setBossPinHash(hash) {
  await setDoc(doc(db, "settings", "bossPin"), { hash });
}

function BossPinUnlock({ pinHash, onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    const hash = await hashPin(pin);
    if (hash === pinHash) onUnlock();
    else { setError("Wrong PIN."); setPin(""); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5" style={{ backgroundColor: C.paper, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <form onSubmit={submit} className="w-full max-w-sm p-6 rounded-lg border text-center" style={{ borderColor: C.hair, backgroundColor: C.card }}>
        <div className="mb-3 flex justify-center"><Logo height={24} /></div>
        <h1 className="text-lg font-bold mb-4" style={{ color: C.ink }}>Enter PIN to continue</h1>
        <input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={8} autoComplete="off" value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className={inputCls} style={{ ...inputStyle(), textAlign: "center", fontSize: 22, letterSpacing: 6, WebkitTextSecurity: "disc" }} />
        {error && <div className="text-sm mt-2" style={{ color: C.red }}>{error}</div>}
        <div className="mt-4"><Btn type="submit">Unlock</Btn></div>
      </form>
    </div>
  );
}

// Wraps BossPage: checks Firestore for the PIN you set. If you haven't set
// one yet, the page refuses to load at all rather than letting anyone in —
// no PIN means no access. Leaving the app re-locks it, same as your own
// Quick Unlock.
function BossPinGate({ children }) {
  const [unlocked, setUnlocked] = useState(false);
  const [pinHash, setPinHash] = useState(undefined); // undefined = loading, null = not set yet
  useLockOnBackground(true, () => setUnlocked(false));

  useEffect(() => { getBossPinHash().then(setPinHash); }, []);

  if (pinHash === undefined) {
    return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.paper }}><Loader2 className="animate-spin" color={C.slate} size={28} /></div>;
  }
  if (!pinHash) {
    return (
      <div className="min-h-screen flex items-center justify-center p-5 text-center" style={{ backgroundColor: C.paper, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
        <div className="max-w-sm">
          <div className="mb-3 flex justify-center"><Logo height={24} /></div>
          <div className="text-sm" style={{ color: C.muted }}>This page isn't set up yet — ask your manager to set a PIN first.</div>
        </div>
      </div>
    );
  }
  if (!unlocked) return <BossPinUnlock pinHash={pinHash} onUnlock={() => setUnlocked(true)} />;
  return children;
}

function BossPage() {
  useFonts();
  useEffect(() => { document.title = "Abeco Management — Invoice Approvals"; }, []);
  const authReady = useAnonAuth();
  // Deliberately reads ONLY invoices — nothing else. Vendor and building
  // names are already snapshotted onto each invoice when it's created, so
  // this session never needs (or is able to) read contractors, buildings,
  // violations, or work orders.
  const [invoices, saveInvoice, , invReady] = useCollectionSynced("invoices", authReady);
  const loading = !authReady || !invReady;

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.paper }}><Loader2 className="animate-spin" color={C.slate} size={28} /></div>;
  }
  return (
    <BossPinGate>
      <BossView invoices={invoices} onUpdate={saveInvoice} standalone />
    </BossPinGate>
  );
}

export default function App() {
  // Works two ways so the same code runs on Vercel (clean /boss URL) and on
  // GitHub Pages, which can't rewrite paths (#/boss URL instead).
  const path = typeof window !== "undefined" ? window.location.pathname.replace(/\/+$/, "") : "";
  const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#\/?/, "") : "";
  const isBossRoute = path === "/boss" || hash === "boss";

  // Swaps the "Add to Home Screen" identity (manifest + iOS title) so your
  // boss installing from /boss gets his own distinct app icon and name,
  // separate from your main Ops Board install.
  useEffect(() => {
    const manifestLink = document.getElementById("app-manifest");
    const appleTitle = document.getElementById("apple-app-title");
    if (isBossRoute) {
      if (manifestLink) manifestLink.setAttribute("href", "manifest-boss.webmanifest");
      if (appleTitle) appleTitle.setAttribute("content", "Abeco Invoices");
    } else {
      if (manifestLink) manifestLink.setAttribute("href", "manifest.webmanifest");
      if (appleTitle) appleTitle.setAttribute("content", "Abeco Ops");
    }
  }, [isBossRoute]);

  return isBossRoute ? <BossPage /> : <MainApp />;
}

// Named export used by boss-main.jsx, the dedicated entry point for
// boss.html — lets that page render BossPage directly without going
// through the path-detection logic above (it's always the boss page there).
export { BossPage };
