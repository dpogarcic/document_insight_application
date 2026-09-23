"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Chat from './components/Chat';

type Role = "tenant_admin" | "editor" | "viewer";
type DocumentStatus = "Active" | "Processing" | "Needs review";
type Department = { id: string; name: string };
type Version = { id: string; number: number; status: string; updated: string };
type Doc = { id: string; name: string; departments: Department[]; version: number; status: DocumentStatus; updated: string; owner: string; pages: number; currentReadyVersionId: string | null; versions: Version[] };
type TokenClaims = { role?: Role; sub?: string };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
function toDisplayStatus(status: string | undefined): DocumentStatus { return status === "ready" ? "Active" : status === "failed" || status === "cancelled" ? "Needs review" : "Processing"; }

function Icon({ name }: { name: string }) { return <span className="icon" aria-hidden="true">{name}</span>; }

function decodeRole(token: string): Role {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as TokenClaims;
    return payload.role ?? "viewer";
  } catch { return "viewer"; }
}

export default function Home() {
  const [token, setToken] = useState("");
  const [role, setRole] = useState<Role>("tenant_admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [busyLogin, setBusyLogin] = useState(false);
  const [page, setPage] = useState<"library" | "chat">("library");
  const [filter, setFilter] = useState("all");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [libraryError, setLibraryError] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadDepartments, setUploadDepartments] = useState<string[]>([]);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [versionsDoc, setVersionsDoc] = useState<Doc | null>(null);
  const [activationMessage, setActivationMessage] = useState("");
  const [activating, setActivating] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem("document-insight-token");
    if (stored) { setToken(stored); setRole(decodeRole(stored)); }
  }, []);

  useEffect(() => { if (token) void loadLibrary(); }, [token]);
  const visibleDocs = useMemo(() => filter === "all" ? docs : docs.filter((doc) => doc.departments.some((department) => department.id === filter)), [docs, filter]);
  const canUpload = role !== "viewer";
  const isAdmin = role === "tenant_admin";

  async function loadLibrary() {
    setLibraryError("");
    try {
      const response = await fetch(`${API_URL}/documents`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("We couldn’t load your document library.");
      const data = await response.json() as { documents: Array<{ document_id: string; title: string; departments: Array<{ department_id: string; name: string }>; current_ready_version_id: string | null; latest_version: { version_number: number; status: string; created_at: string } | null; versions: Array<{ document_version_id: string; version_number: number; status: string; created_at: string }> }>; departments: Array<{ department_id: string; name: string }> };
      const available = data.departments.map((department) => ({ id: department.department_id, name: department.name }));
      setDepartments(available);
      setUploadDepartments((current) => current.length ? current : available.slice(0, 1).map((department) => department.id));
      setDocs(data.documents.map((document) => {
        const activeVersion = document.versions.find(
          (version) => version.document_version_id === document.current_ready_version_id,
        );
        const displayedVersion = activeVersion ?? document.latest_version;
        return {
          id: document.document_id,
          name: document.title,
          departments: document.departments.map((department) => ({ id: department.department_id, name: department.name })),
          version: displayedVersion?.version_number ?? 0,
          status: activeVersion ? "Active" : toDisplayStatus(document.latest_version?.status),
          updated: displayedVersion ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(displayedVersion.created_at)) : "Not uploaded",
          owner: "Your workspace",
          pages: 0,
          currentReadyVersionId: document.current_ready_version_id,
          versions: document.versions.map((version) => ({ id: version.document_version_id, number: version.version_number, status: version.status, updated: new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(version.created_at)) })),
        };
      }));
    } catch (error) { setLibraryError(error instanceof Error ? error.message : "Unable to load your document library."); }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusyLogin(true); setLoginError("");
    try {
      const response = await fetch(`${API_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      if (!response.ok) throw new Error("We couldn’t sign you in with those details.");
      const data = await response.json() as { access_token: string };
      setToken(data.access_token); setRole(decodeRole(data.access_token)); window.localStorage.setItem("document-insight-token", data.access_token);
    } catch (error) { setLoginError(error instanceof Error ? error.message : "Unable to reach the service."); } finally { setBusyLogin(false); }
  }

  function chooseFile(nextFile: File | null) {
    if (!nextFile) return;
    if (nextFile.size > 25 * 1024 * 1024) { setUploadMessage("Choose a file smaller than 25 MiB."); return; }
    setFile(nextFile); setUploadMessage("");
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) { setUploadMessage("Choose a PDF, PNG, or JPEG to continue."); return; }
    setUploading(true); setUploadMessage("");
    const body = new FormData(); body.append("file", file);
    if (selectedDoc) body.append("document_id", selectedDoc.id);
    if (!selectedDoc && isAdmin) uploadDepartments.forEach((department) => body.append("department_ids", department));
    try {
      const response = await fetch(`${API_URL}/ingest`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body });
      if (!response.ok) throw new Error("The upload was not accepted. Check the file and try again.");
      const result = await response.json() as { document_id: string; version_number: number; job_id: string };
      const version = result.version_number;
      const name = selectedDoc?.name ?? file.name.replace(/\.[^/.]+$/, "");
      setDocs((current) => selectedDoc ? current.map((doc) => doc.id === selectedDoc.id ? { ...doc, version, status: "Processing", updated: "Just now" } : doc) : [{ id: result.document_id, name, departments: departments.filter((department) => uploadDepartments.includes(department.id)), version, status: "Processing", updated: "Just now", owner: "You", pages: 0, currentReadyVersionId: null, versions: [] }, ...current]);
      setUploadMessage(`Accepted as v${version}. Processing job ${result.job_id.slice(0, 8)} is now queued.`);
    } catch (error) { setUploadMessage(error instanceof Error ? error.message : "The upload could not be completed."); } finally { setUploading(false); }
  }

  async function activateVersion(document: Doc, version: Version) {
    setActivating(version.id); setActivationMessage("");
    try { const response = await fetch(`${API_URL}/documents/${document.id}/activate`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ document_version_id: version.id }) }); if (!response.ok) { const body = await response.json() as { detail?: { message?: string } }; throw new Error(body.detail?.message ?? "The version could not be activated."); } setDocs((current) => current.map((doc) => doc.id === document.id ? { ...doc, currentReadyVersionId: version.id } : doc)); setVersionsDoc((current) => current?.id === document.id ? { ...current, currentReadyVersionId: version.id } : current); setActivationMessage(`v${version.number} is now the active searchable version.`); } catch (error) { setActivationMessage(error instanceof Error ? error.message : "The version could not be activated."); } finally { setActivating(""); }
  }

  if (!token) return <LoginScreen email={email} password={password} error={loginError} busy={busyLogin} onEmail={setEmail} onPassword={setPassword} onSubmit={login} />;

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">◇</span><span>document<span>insight</span></span></div>
      <div className="workspace"><span className="workspace-dot"/>Acme workspace <Icon name="⌄" /></div>
      <nav><button className={page === "library" ? "nav-active" : ""} onClick={() => setPage("library")}><Icon name="▦" />Library</button><button className={page === "chat" ? "nav-active" : ""} onClick={() => setPage("chat")}><Icon name="◌" />Ask documents</button></nav>
      <div className="sidebar-bottom"><div className="role-card"><span>{role.replace("_", " ")}</span><strong>{email || "Signed in"}</strong></div><button onClick={() => { window.localStorage.removeItem("document-insight-token"); setToken(""); }}>↪ Sign out</button></div>
    </aside>
    <section className="content">
      {page === "chat" ? <Chat token={token} docs={visibleDocs} /> : <Library role={role} docs={visibleDocs} departments={departments} filter={filter} setFilter={setFilter} libraryError={libraryError} canUpload={canUpload} onUpload={() => { setSelectedDoc(null); setFile(null); setUploadMessage(""); setShowUpload(true); }} onVersion={(doc) => { setSelectedDoc(doc); setFile(null); setUploadMessage(""); setShowUpload(true); }} onManageVersions={(doc) => { setVersionsDoc(doc); setActivationMessage(""); }} />}
    </section>
    {showUpload && <UploadModal isAdmin={isAdmin} selectedDoc={selectedDoc} file={file} availableDepartments={departments} departments={uploadDepartments} setDepartments={setUploadDepartments} message={uploadMessage} uploading={uploading} onClose={() => setShowUpload(false)} onFile={chooseFile} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files[0] ?? null); }} onSubmit={upload} />}
    {versionsDoc && <VersionsModal document={versionsDoc} isAdmin={isAdmin} activating={activating} message={activationMessage} onClose={() => setVersionsDoc(null)} onActivate={activateVersion} />}
  </main>;
}

function LoginScreen({ email, password, error, busy, onEmail, onPassword, onSubmit }: { email: string; password: string; error: string; busy: boolean; onEmail: (v: string) => void; onPassword: (v: string) => void; onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  return <main className="login-layout"><section className="login-panel"><div className="brand"><span className="brand-mark">◇</span><span>document<span>insight</span></span></div><div className="login-copy"><p className="eyebrow">WELCOME BACK</p><h1>Your documents,<br />thoughtfully organized.</h1><p>Sign in to explore the knowledge your team is building.</p></div><form onSubmit={onSubmit}><label>Work email<input type="email" required value={email} onChange={(e) => onEmail(e.target.value)} placeholder="name@company.com" /></label><label>Password<input type="password" required minLength={8} value={password} onChange={(e) => onPassword(e.target.value)} placeholder="••••••••" /></label>{error && <p className="form-error">{error}</p>}<button className="primary wide" disabled={busy}>{busy ? "Signing in…" : "Sign in"} <span>→</span></button></form><p className="login-foot">Need a workspace? Ask your administrator for an invitation.</p></section><section className="login-art"><div className="glow"/><p>“The right context,<br /><i>right when you need it.</i>”</p><div className="art-card"><span>✦</span><strong>Search less. Understand more.</strong><small>Private, permission-aware answers from your team’s documents.</small></div></section></main>;
}

function Library({ role, docs, departments, filter, setFilter, libraryError, canUpload, onUpload, onVersion, onManageVersions }: { role: Role; docs: Doc[]; departments: Department[]; filter: string; setFilter: (v: string) => void; libraryError: string; canUpload: boolean; onUpload: () => void; onVersion: (doc: Doc) => void; onManageVersions: (doc: Doc) => void }) {
  return <><header className="topbar"><div><p className="eyebrow">DOCUMENT LIBRARY</p><h1>Good morning.</h1><p className="muted">Manage the sources your team can rely on.</p></div>{canUpload && <button className="primary" onClick={onUpload}><span>＋</span> Add document</button>}</header><section className="stats"><Stat value={String(docs.length)} label="Visible documents" detail="Within your permissions"/><Stat value={String(docs.filter((doc) => doc.status === "Processing").length)} label="Processing" detail="Updates on their way"/><Stat value={String(departments.length)} label="Departments" detail="Available to you"/></section><section className="library-head"><div><h2>All documents</h2><p>{docs.length} documents visible to you</p></div><label className="select-label">Department<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label></section>{libraryError && <p className="form-error">{libraryError}</p>}<div className="document-table"><div className="table-row table-label"><span>NAME</span><span>DEPARTMENTS</span><span>VERSION</span><span>STATUS</span><span>UPDATED</span><span/></div>{docs.map((doc) => <div className="table-row" key={doc.id}><span className="doc-name"><b className="file-icon">▤</b><span><strong>{doc.name}</strong><small>{doc.pages ? `${doc.pages} pages` : "Document source"} · {doc.owner}</small></span></span><span className="pills">{doc.departments.map((department) => <i key={department.id}>{department.name}</i>)}</span><span className="version">v{doc.version}{doc.currentReadyVersionId ? " · active" : " · no active version"}</span><span><i className={`status ${doc.status.toLowerCase().replace(" ", "-")}`}>{doc.status}</i></span><span className="updated">{doc.updated}</span><span><button className="quiet" onClick={() => onManageVersions(doc)}>Versions</button>{canUpload && <button className="quiet" onClick={() => onVersion(doc)}>Upload v{doc.version + 1}</button>}</span></div>)}</div>{docs.length === 0 && !libraryError && <p className="permission-note">No documents are visible yet. Add the first one to start building your library.</p>}{role === "viewer" && <p className="permission-note">You can explore and ask questions within your department access. Only editors and admins can add versions.</p>}<section className="ingestion-note"><div><span className="step-number">01</span><div><strong>Versioned by design</strong><p>Adding a replacement creates a new immutable version. Your active version stays available until an administrator activates the ready update.</p></div></div><span>Learn about versioning →</span></section></>;
}

function Stat({ value, label, detail }: { value: string; label: string; detail: string }) { return <article><strong>{value}</strong><span>{label}</span><small>{detail}</small></article>; }

function UploadModal({ isAdmin, selectedDoc, file, availableDepartments, departments: selected, setDepartments, message, uploading, onClose, onFile, onDrop, onSubmit }: { isAdmin: boolean; selectedDoc: Doc | null; file: File | null; availableDepartments: Department[]; departments: string[]; setDepartments: (items: string[]) => void; message: string; uploading: boolean; onClose: () => void; onFile: (file: File | null) => void; onDrop: (event: DragEvent<HTMLDivElement>) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const toggle = (department: string) => setDepartments(selected.includes(department) ? selected.filter((item) => item !== department) : [...selected, department]);
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="upload-modal" onSubmit={onSubmit}><button type="button" className="close" onClick={onClose}>×</button><p className="eyebrow">{selectedDoc ? `NEW VERSION · ${selectedDoc.name}` : "NEW DOCUMENT"}</p><h2>{selectedDoc ? `Upload v${selectedDoc.version + 1}` : "Bring in a document"}</h2><p className="muted">{selectedDoc ? "This update keeps the same departments and creates a separate, immutable version." : "PDF, PNG, or JPEG up to 25 MiB. We’ll securely process it in the background."}</p><div className="dropzone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}><input id="document-file" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event: ChangeEvent<HTMLInputElement>) => onFile(event.target.files?.[0] ?? null)} /><label htmlFor="document-file"><span className="upload-symbol">↑</span><strong>{file ? file.name : "Drop your file here"}</strong><small>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MiB · choose another file` : "or browse from your computer"}</small></label></div>{isAdmin && !selectedDoc && <fieldset><legend>Departments with access</legend><p className="muted">At least one department must be selected. You can adjust this later as an administrator.</p><div className="checks">{availableDepartments.map((department) => <label key={department.id}><input type="checkbox" checked={selected.includes(department.id)} onChange={() => toggle(department.id)} />{department.name}</label>)}</div></fieldset>}{selectedDoc && <div className="inherit"><span>↳</span><div><strong>Department access is inherited</strong><p>{selectedDoc.departments.map((department) => department.name).join(" · ")}</p></div></div>}{message && <p className="upload-message">{message}</p>}<div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={uploading}>{uploading ? "Sending…" : selectedDoc ? "Upload new version" : "Add document"}</button></div></form></div>;
}

function VersionsModal({ document, isAdmin, activating, message, onClose, onActivate }: { document: Doc; isAdmin: boolean; activating: string; message: string; onClose: () => void; onActivate: (document: Doc, version: Version) => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><section className="upload-modal versions-modal"><button className="close" onClick={onClose}>×</button><p className="eyebrow">VERSION HISTORY</p><h2>{document.name}</h2><p className="muted">Only a ready version can become searchable. Uploading a new version never changes the active version automatically.</p><div className="version-list">{document.versions.map((version) => { const active = version.id === document.currentReadyVersionId; const ready = version.status === "ready"; return <article key={version.id} className={active ? "version-row is-active" : "version-row"}><div><strong>v{version.number} {active && <span>Active</span>}</strong><small>{version.status} · {version.updated}</small></div>{isAdmin && !active && ready && <button className="primary" disabled={activating === version.id} onClick={() => onActivate(document, version)}>{activating === version.id ? "Activating…" : "Make active"}</button>}{!active && !ready && <em>Not ready to activate</em>}</article>; })}</div>{!isAdmin && <p className="permission-note">Only a tenant administrator can change the active version.</p>}{message && <p className="upload-message">{message}</p>}</section></div>;
}

