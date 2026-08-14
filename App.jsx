import React, { useState, useEffect } from "react";
import {
  Plus, X, Check, HelpCircle, AlertTriangle, MessageCircle,
  Trash2, ChevronDown, ChevronUp, Copy, FileText, Wrench, ShieldAlert,
  CheckCircle2, Loader2, Building2, Users, User
} from "lucide-react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
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

function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

const inputCls = "px-3 py-2 rounded-md border bg-white text-sm focus:outline-none focus:ring-2 w-full";
const selectCls = inputCls;
function inputStyle() { return { borderColor: C.hair, color: C.ink }; }

function Btn({ children, onClick, tone = "slate", size = "md", icon: Icon, disabled }) {
  const tones = {
    slate: { bg: C.slate, fg: "#fff" }, green: { bg: C.green, fg: "#fff" },
    red: { bg: C.red, fg: "#fff" }, amber: { bg: C.amber, fg: "#fff" },
    ghost: { bg: "transparent", fg: C.ink },
  };
  const t = tones[tone];
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm";
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md font-medium transition-opacity hover:opacity-90 disabled:opacity-40 ${pad}`}
      style={{ backgroundColor: t.bg, color: t.fg, border: tone === "ghost" ? `1px solid ${C.hair}` : "none" }}>
      {Icon && <Icon size={size === "sm" ? 13 : 15} />}
      {children}
    </button>
  );
}

function NotesLog({ notes, onAdd }) {
  const [text, setText] = useState("");
  return (
    <div className="mt-3 pt-3 border-t" style={{ borderColor: C.hair }}>
      <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Notes</div>
      <div className="flex flex-col gap-1.5 mb-2 max-h-40 overflow-y-auto">
        {notes.length === 0 && <div className="text-sm italic" style={{ color: C.muted }}>No notes yet.</div>}
        {notes.map((n, i) => (
          <div key={i} className="text-sm rounded px-2 py-1.5" style={{ backgroundColor: C.paperDark }}>
            <span style={{ color: C.muted, fontFamily: "'IBM Plex Mono', monospace" }} className="text-[11px] mr-2">{fmtDate(n.date)}</span>
            {n.text}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note..."
          className={inputCls} style={inputStyle()}
          onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { onAdd(text.trim()); setText(""); } }} />
        <Btn size="sm" onClick={() => { if (text.trim()) { onAdd(text.trim()); setText(""); } }}>Add</Btn>
      </div>
    </div>
  );
}

/* ---------------- PICKERS ---------------- */

function ContractorPicker({ contractors, value, onChange, onCreate, label = "Contractor" }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const save = () => {
    if (!name.trim()) return;
    const c = { id: uid(), name: name.trim(), phone: phone.trim(), email: "" };
    onCreate(c); onChange(c.id);
    setAdding(false); setName(""); setPhone("");
  };
  return (
    <Field label={label}>
      <select className={selectCls} style={inputStyle()} value={adding ? "__new__" : (value || "")}
        onChange={(e) => { if (e.target.value === "__new__") setAdding(true); else { setAdding(false); onChange(e.target.value); } }}>
        <option value="">Select contractor…</option>
        {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        <option value="__new__">+ Add new contractor</option>
      </select>
      {adding && (
        <div className="flex gap-2 mt-1.5">
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} style={inputStyle()} />
          <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} style={inputStyle()} />
          <Btn size="sm" onClick={save}>Save</Btn>
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
          {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
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

function lookupContractor(contractors, id) { return contractors.find((c) => c.id === id); }
function lookupBuilding(buildings, id) { return buildings.find((b) => b.id === id); }
function lookupApartment(buildings, buildingId, apartmentId) {
  const b = lookupBuilding(buildings, buildingId);
  return b ? b.apartments.find((a) => a.id === apartmentId) : null;
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

function InvoiceForm({ contractors, buildings, onCreateContractor, onSave, onCancel }) {
  const [f, setF] = useState({ contractorId: "", buildingId: "", apartmentId: "", amount: "", description: "", date: todayISO() });
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-lg border" style={{ borderColor: C.hair, backgroundColor: C.card }}>
      <ContractorPicker contractors={contractors} value={f.contractorId} onChange={(id) => setF((prev) => ({ ...prev, contractorId: id }))} onCreate={onCreateContractor} label="Vendor / contractor" />
      <Field label="Amount ($)"><input className={inputCls} style={inputStyle()} type="number" value={f.amount} onChange={set("amount")} /></Field>
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

function InvoiceCard({ inv, contractors, buildings, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const contractor = lookupContractor(contractors, inv.contractorId);
  const building = lookupBuilding(buildings, inv.buildingId);
  const messages = inv.messages || [];
  const stamp = inv.status === "approved" ? <Stamp tone="green">Approved</Stamp> :
    inv.status === "declined" ? <Stamp tone="red">Declined</Stamp> : <Stamp tone="slate">Pending</Stamp>;

  const sendMessage = (text) => onUpdate({ ...inv, messages: [...messages, { from: "manager", text, date: todayISO() }] });

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: C.hair, backgroundColor: C.card }}>
      <div className="p-4 flex items-start justify-between gap-3 cursor-pointer" onClick={() => setOpen(!open)}>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold" style={{ color: C.ink }}>{contractor?.name || "Unassigned vendor"}</span>
            {stamp}
            {messages.length > 0 && <Stamp tone="amber">{messages.length} msg{messages.length === 1 ? "" : "s"}</Stamp>}
          </div>
          <div className="text-sm mt-0.5" style={{ color: C.muted }}>{building?.name || "No building"} · {fmtDate(inv.date)}</div>
          <div className="text-sm mt-1" style={{ color: C.ink }}>{inv.description}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-semibold" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.ink }}>${Number(inv.amount).toLocaleString()}</div>
          {open ? <ChevronUp size={16} className="ml-auto mt-1" color={C.muted} /> : <ChevronDown size={16} className="ml-auto mt-1" color={C.muted} />}
        </div>
      </div>
      {open && (
        <div className="px-4 pb-4">
          <div className="flex flex-wrap gap-2">
            <Btn size="sm" tone="green" icon={Check} onClick={() => onUpdate({ ...inv, status: "approved" })}>Approve</Btn>
            <Btn size="sm" tone="red" icon={X} onClick={() => onUpdate({ ...inv, status: "declined" })}>Decline</Btn>
            <Btn size="sm" tone="ghost" icon={Trash2} onClick={() => onDelete(inv.id)}>Remove</Btn>
          </div>
          <div className="mt-3 pt-3 border-t" style={{ borderColor: C.hair }}>
            <div className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: C.muted }}>Conversation with your boss</div>
            <MessageThread messages={messages} onSend={sendMessage} sendAs="manager" placeholder="Reply to your boss's question..." />
          </div>
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

function ViolationCard({ v, contractors, buildings, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const u = urgency(v);
  const building = lookupBuilding(buildings, v.buildingId);
  const apartment = lookupApartment(buildings, v.buildingId, v.apartmentId);
  const contractor = lookupContractor(contractors, v.contractorId);

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: C.hair, backgroundColor: C.card }}>
      <div className="p-4 flex items-start justify-between gap-3 cursor-pointer" onClick={() => setOpen(!open)}>
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
        <div className="px-4 pb-4">
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
            onCreate={() => {}} label="Assign to (contractor)" />
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

function WorkOrderCard({ w, contractors, buildings, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const building = lookupBuilding(buildings, w.buildingId);
  const apartment = lookupApartment(buildings, w.buildingId, w.apartmentId);
  const contractor = lookupContractor(contractors, w.contractorId);
  const days = daysBetween(w.dateOpened, w.dateResolved || todayISO());
  const stamp = w.status === "resolved" ? <Stamp tone="green">Resolved</Stamp> :
    w.status === "in-progress" ? <Stamp tone="amber">In progress</Stamp> : <Stamp tone="slate">Open</Stamp>;

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: C.hair, backgroundColor: C.card }}>
      <div className="p-4 flex items-start justify-between gap-3 cursor-pointer" onClick={() => setOpen(!open)}>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold" style={{ color: C.ink }}>{apartment?.tenantName || "No tenant on file"}</span>
            <span className="text-sm" style={{ color: C.muted }}>{building?.name || ""}{apartment ? ` · Apt ${apartment.number}` : ""}</span>
            {stamp}
          </div>
          <div className="text-sm mt-1" style={{ color: C.ink }}>{w.issue}</div>
          <div className="text-sm mt-1" style={{ color: C.muted }}>{contractor ? `Assigned: ${contractor.name}` : "Unassigned"} · Open {days}d{w.status === "resolved" ? " (resolved)" : ""}</div>
        </div>
        {open ? <ChevronUp size={16} color={C.muted} /> : <ChevronDown size={16} color={C.muted} />}
      </div>
      {open && (
        <div className="px-4 pb-4">
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
              onChange={(id) => onUpdate({ ...w, contractorId: id, status: w.status === "open" ? "in-progress" : w.status })} onCreate={() => {}} label="Assigned to" />
            <Field label="Date resolved"><input className={inputCls} style={inputStyle()} type="date" value={w.dateResolved}
              onChange={(e) => onUpdate({ ...w, dateResolved: e.target.value, status: e.target.value ? "resolved" : "in-progress" })} /></Field>
          </div>
          <NotifyPanel kind="workorder" buildingName={building?.name || ""} aptNumber={apartment?.number || ""} description={w.issue} tenant={apartment} contractor={contractor} />
          <div className="flex flex-wrap gap-2 mt-3">
            {w.status !== "resolved" && <Btn size="sm" tone="green" icon={CheckCircle2} onClick={() => onUpdate({ ...w, status: "resolved", dateResolved: todayISO() })}>Mark resolved</Btn>}
            <Btn size="sm" tone="ghost" icon={Trash2} onClick={() => onDelete(w.id)}>Remove</Btn>
          </div>
          <NotesLog notes={w.notes || []} onAdd={(text) => onUpdate({ ...w, notes: [...(w.notes || []), { text, date: todayISO() }] })} />
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
        </div>
        <Btn size="sm" tone="ghost" icon={Trash2} onClick={() => onDelete(b.id)} />
      </div>
      <div className="px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Apartments</div>
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

function DirectoryTab({ buildings, contractors, buildingsPersist, contractorsPersist }) {
  const [view, setView] = useState("buildings");
  const [newBuilding, setNewBuilding] = useState("");
  const [newContractor, setNewContractor] = useState({ name: "", phone: "", email: "" });
  const [justAddedId, setJustAddedId] = useState(null);

  const addBuilding = () => {
    if (!newBuilding.trim()) return;
    const b = { id: uid(), name: newBuilding.trim(), apartments: [] };
    buildingsPersist([...buildings, b]);
    setNewBuilding("");
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
          <div className="flex gap-2">
            <input className={inputCls} style={inputStyle()} placeholder="New building name / address" value={newBuilding} onChange={(e) => setNewBuilding(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addBuilding(); }} />
            <Btn icon={Plus} onClick={addBuilding}>Add building</Btn>
          </div>
          {buildings.length === 0 && <Empty text="No buildings yet. Add one above, fill in its units, then collapse it." />}
          {buildings.map((b) => (
            <BuildingCard key={b.id} b={b} defaultOpen={b.id === justAddedId}
              onUpdate={(next) => buildingsPersist(buildings.map((x) => (x.id === next.id ? next : x)))}
              onDelete={(id) => buildingsPersist(buildings.filter((x) => x.id !== id))} />
          ))}
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

function BossInvoiceCard({ inv, contractors, buildings, onUpdate }) {
  const [showChat, setShowChat] = useState((inv.messages || []).length > 0);
  const contractor = lookupContractor(contractors, inv.contractorId);
  const building = lookupBuilding(buildings, inv.buildingId);
  const messages = inv.messages || [];
  const stamp = inv.status === "approved" ? <Stamp tone="green">Approved</Stamp> :
    inv.status === "declined" ? <Stamp tone="red">Declined</Stamp> : <Stamp tone="slate">Awaiting your review</Stamp>;

  const sendMessage = (text) => onUpdate({ ...inv, messages: [...messages, { from: "boss", text, date: todayISO() }] });

  return (
    <div className="rounded-xl border-2 p-5" style={{ borderColor: C.hair, backgroundColor: C.card }}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-lg font-bold" style={{ color: C.ink }}>{contractor?.name || "Unassigned vendor"}</div>
          <div className="text-sm mt-0.5" style={{ color: C.muted }}>{building?.name || "No building"} · {fmtDate(inv.date)}</div>
        </div>
        {stamp}
      </div>
      <div className="text-2xl font-bold mb-2" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.ink }}>${Number(inv.amount).toLocaleString()}</div>
      <div className="text-base mb-4" style={{ color: C.ink }}>{inv.description}</div>

      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => onUpdate({ ...inv, status: "approved" })}
          className="flex flex-col items-center gap-1 py-4 rounded-lg font-semibold text-white"
          style={{ backgroundColor: C.green }}>
          <Check size={22} /> Approve
        </button>
        <button onClick={() => onUpdate({ ...inv, status: "declined" })}
          className="flex flex-col items-center gap-1 py-4 rounded-lg font-semibold text-white"
          style={{ backgroundColor: C.red }}>
          <X size={22} /> Decline
        </button>
        <button onClick={() => setShowChat(!showChat)}
          className="flex flex-col items-center gap-1 py-4 rounded-lg font-semibold text-white relative"
          style={{ backgroundColor: C.amber }}>
          <HelpCircle size={22} /> Question
          {messages.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-[11px] flex items-center justify-center font-bold"
              style={{ backgroundColor: C.red, color: "#fff" }}>{messages.length}</span>
          )}
        </button>
      </div>
      {showChat && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: C.hair }}>
          <MessageThread messages={messages} onSend={sendMessage} sendAs="boss" placeholder="Type your question..." />
        </div>
      )}
    </div>
  );
}

function BossView({ invoices, contractors, buildings, onUpdate, onExit, standalone }) {
  const pending = invoices.filter((i) => i.status === "pending");
  const decided = invoices.filter((i) => i.status !== "pending");
  return (
    <div className="min-h-screen" style={{ backgroundColor: C.paper, fontFamily: "'IBM Plex Sans', system-ui, sans-serif", color: C.ink }}>
      <header className="px-5 sm:px-8 pt-6 pb-4 border-b flex items-center justify-between" style={{ borderColor: C.hair }}>
        <h1 className="text-2xl font-bold">Invoices to review</h1>
        {!standalone && <button onClick={onExit} className="text-xs underline" style={{ color: C.muted }}>Exit</button>}
      </header>
      <main className="px-5 sm:px-8 py-5 max-w-lg mx-auto flex flex-col gap-4">
        {pending.length === 0 && decided.length === 0 && <Empty text="No invoices yet." />}
        {pending.length === 0 && decided.length > 0 && (
          <div className="text-center py-6" style={{ color: C.muted }}>Nothing waiting on you right now.</div>
        )}
        {pending.map((inv) => (
          <BossInvoiceCard key={inv.id} inv={inv} contractors={contractors} buildings={buildings}
            onUpdate={(next) => onUpdate(invoices.map((i) => (i.id === next.id ? next : i)))} />
        ))}
        {decided.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: C.muted }}>Already reviewed</div>
            <div className="flex flex-col gap-2">
              {decided.map((inv) => {
                const contractor = lookupContractor(contractors, inv.contractorId);
                const stamp = inv.status === "approved" ? <Stamp tone="green">Approved</Stamp> : <Stamp tone="red">Declined</Stamp>;
                return (
                  <div key={inv.id} className="flex items-center justify-between gap-2 p-3 rounded-lg border" style={{ borderColor: C.hair, backgroundColor: C.card }}>
                    <div className="text-sm" style={{ color: C.ink }}>{contractor?.name || "Vendor"} — ${Number(inv.amount).toLocaleString()}</div>
                    {stamp}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
/* ---------------- ROOT ---------------- */

function MainApp() {
  useFonts();
  const authReady = useAnonAuth();
  const [tab, setTab] = useState("invoices");
  const [showForm, setShowForm] = useState(false);
  const [bossMode, setBossMode] = useState(false);

  const [invoices, invoicesPersist, invReady] = useSynced("invoices", authReady, []);
  const [violations, violationsPersist, vioReady] = useSynced("violations", authReady, []);
  const [workorders, workordersPersist, wkReady] = useSynced("workorders", authReady, []);
  const [contractors, contractorsPersist, conReady] = useSynced("contractors", authReady, SEED_CONTRACTORS);
  const [buildings, buildingsPersist, bldReady] = useSynced("buildings", authReady, []);

  const loading = !authReady || !invReady || !vioReady || !wkReady || !conReady || !bldReady;

  const addContractor = (c) => contractorsPersist([...contractors, c]);

  const pendingInvoices = invoices.filter((i) => i.status === "pending").length;
  const dueViolations = violations.filter((v) => v.status !== "resolved" && daysBetween(todayISO(), v.cureDate) <= 7);
  const openWorkOrders = workorders.filter((w) => w.status !== "resolved").length;

  const tabs = [
    { id: "invoices", label: "Invoices", icon: FileText, count: pendingInvoices },
    { id: "violations", label: "HPD Violations", icon: ShieldAlert, count: dueViolations.length },
    { id: "workorders", label: "Work Orders", icon: Wrench, count: openWorkOrders },
    { id: "directory", label: "Directory", icon: Building2, count: 0 },
  ];

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.paper }}><Loader2 className="animate-spin" color={C.slate} size={28} /></div>;
  }

  if (bossMode) {
    return <BossView invoices={invoices} contractors={contractors} buildings={buildings} onUpdate={invoicesPersist} onExit={() => setBossMode(false)} />;
  }
  return (
    <div className="min-h-screen" style={{ backgroundColor: C.paper, fontFamily: "'IBM Plex Sans', system-ui, sans-serif", color: C.ink }}>
      <header className="px-5 sm:px-8 pt-6 pb-4 border-b" style={{ borderColor: C.hair }}>
        <div className="max-w-3xl mx-auto flex items-end justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest font-semibold" style={{ color: C.slate, fontFamily: "'IBM Plex Mono', monospace" }}>Property Ops</div>
            <h1 className="text-2xl font-bold mt-0.5">Moshe's Ops Board</h1>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <button onClick={() => setBossMode(true)} className="text-xs px-2.5 py-1 rounded-md border font-medium" style={{ borderColor: C.hair, color: C.slate }}>
              Preview Boss View
            </button>
            <div className="text-xs hidden sm:block" style={{ color: C.muted, fontFamily: "'IBM Plex Mono', monospace" }}>{fmtDate(todayISO())}</div>
          </div>
        </div>
      </header>

      <nav className="px-5 sm:px-8 pt-4">
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

      <main className="px-5 sm:px-8 py-5">
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

          {tab !== "directory" && (
            <div className="flex justify-end">
              <Btn icon={showForm ? X : Plus} onClick={() => setShowForm(!showForm)}>
                {showForm ? "Close" : tab === "invoices" ? "New invoice" : tab === "violations" ? "New violation" : "New work order"}
              </Btn>
            </div>
          )}

          {showForm && tab === "invoices" && (
            <InvoiceForm contractors={contractors} buildings={buildings} onCreateContractor={addContractor}
              onCancel={() => setShowForm(false)} onSave={(inv) => { invoicesPersist([inv, ...invoices]); setShowForm(false); }} />
          )}
          {showForm && tab === "violations" && (
            <ViolationForm contractors={contractors} buildings={buildings} onCreateContractor={addContractor}
              onCancel={() => setShowForm(false)} onSave={(v) => { violationsPersist([v, ...violations]); setShowForm(false); }} />
          )}
          {showForm && tab === "workorders" && (
            <WorkOrderForm contractors={contractors} buildings={buildings} onCreateContractor={addContractor}
              onCancel={() => setShowForm(false)} onSave={(w) => { workordersPersist([w, ...workorders]); setShowForm(false); }} />
          )}

          {tab === "invoices" && (invoices.length === 0 ? <Empty text="No invoices yet. Add one to start approving." /> :
            invoices.map((inv) => <InvoiceCard key={inv.id} inv={inv} contractors={contractors} buildings={buildings}
              onUpdate={(next) => invoicesPersist(invoices.map((i) => (i.id === next.id ? next : i)))}
              onDelete={(id) => invoicesPersist(invoices.filter((i) => i.id !== id))} />))}

          {tab === "violations" && (violations.length === 0 ? <Empty text="No violations tracked yet." /> :
            [...violations].sort((a, b) => (a.status === "resolved") - (b.status === "resolved") || a.cureDate.localeCompare(b.cureDate)).map((v) => (
              <ViolationCard key={v.id} v={v} contractors={contractors} buildings={buildings}
                onUpdate={(next) => violationsPersist(violations.map((x) => (x.id === next.id ? next : x)))}
                onDelete={(id) => violationsPersist(violations.filter((x) => x.id !== id))} />
            )))}

          {tab === "workorders" && (workorders.length === 0 ? <Empty text="No work orders yet." /> :
            workorders.map((w) => <WorkOrderCard key={w.id} w={w} contractors={contractors} buildings={buildings}
              onUpdate={(next) => workordersPersist(workorders.map((x) => (x.id === next.id ? next : x)))}
              onDelete={(id) => workordersPersist(workorders.filter((x) => x.id !== id))} />))}

          {tab === "directory" && (
            <DirectoryTab buildings={buildings} contractors={contractors} buildingsPersist={buildingsPersist} contractorsPersist={contractorsPersist} />
          )}
        </div>
      </main>
    </div>
  );
}

function Empty({ text }) {
  return <div className="text-center py-10 rounded-lg border border-dashed" style={{ borderColor: C.hair, color: C.muted }}>{text}</div>;
}

/* ---------------- BOSS-ONLY LINK ---------------- */
// Visiting /boss loads ONLY this component — it never fetches or renders
// violations, work orders, or the directory, and there is no way to
// navigate to the rest of the app from here.

function BossPage() {
  useFonts();
  const authReady = useAnonAuth();
  const [invoices, invoicesPersist, invReady] = useSynced("invoices", authReady, []);
  const [contractors, , conReady] = useSynced("contractors", authReady, SEED_CONTRACTORS);
  const [buildings, , bldReady] = useSynced("buildings", authReady, []);
  const loading = !authReady || !invReady || !conReady || !bldReady;

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: C.paper }}><Loader2 className="animate-spin" color={C.slate} size={28} /></div>;
  }
  return <BossView invoices={invoices} contractors={contractors} buildings={buildings} onUpdate={invoicesPersist} standalone />;
}

export default function App() {
  const isBossRoute = typeof window !== "undefined" && window.location.pathname.replace(/\/+$/, "") === "/boss";
  return isBossRoute ? <BossPage /> : <MainApp />;
}

