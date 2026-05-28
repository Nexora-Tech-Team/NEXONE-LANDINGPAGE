import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8089';
const statusOptions = ['new', 'contacted', 'qualified', 'closed', 'lost'];
const mainNeedOptions = [
  'Integrated Business Platform',
  'Project & Operations Management',
  'Finance & Billing Monitoring',
  'HR & Team Activity Monitoring',
  'Document & Approval System',
];

function apiFetch(path, options = {}) {
  const token = localStorage.getItem('nexoneAdminToken');
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('nexoneAdminToken') || '');
  const [admin, setAdmin] = useState(null);

  useEffect(() => {
    if (!token) return;
    apiFetch('/api/v1/admin/me')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setAdmin(data.admin))
      .catch(() => {
        localStorage.removeItem('nexoneAdminToken');
        setToken('');
      });
  }, [token]);

  function handleLogin(nextToken, nextAdmin) {
    localStorage.setItem('nexoneAdminToken', nextToken);
    setToken(nextToken);
    setAdmin(nextAdmin);
  }

  function logout() {
    localStorage.removeItem('nexoneAdminToken');
    setToken('');
    setAdmin(null);
  }

  if (!token) return <Login onLogin={handleLogin} />;
  return <Dashboard admin={admin} onLogout={logout} />;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      onLogin(data.token, data.admin);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand-lockup">
          <img src="/Asset/Logo NEXONE.png" alt="NEXONE" />
          <span>Leads Admin</span>
        </div>
        <h1>Welcome back</h1>
        <p>Sign in to view demo requests and manage incoming NEXONE leads.</p>
        <form onSubmit={submit}>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="primary" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
        </form>
      </section>
    </main>
  );
}

const emptyForm = { fullName: '', company: '', email: '', phone: '', mainNeed: mainNeedOptions[0], message: '' };

function Dashboard({ admin, onLogout }) {
  const [section, setSection] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [leads, setLeads] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (query) params.set('q', query);
      const [statsRes, leadsRes] = await Promise.all([
        apiFetch('/api/v1/admin/dashboard'),
        apiFetch(`/api/v1/admin/leads?${params}`),
      ]);
      const statsData = await statsRes.json();
      const leadsData = await leadsRes.json();
      if (!statsRes.ok || !leadsRes.ok) throw new Error(statsData.error || leadsData.error || 'Failed to load');
      setStats(statsData.stats);
      setLeads(leadsData.leads || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filterStatus]);

  async function updateLead(lead, patch) {
    const next = { status: lead.status, adminNotes: lead.adminNotes, ...patch };
    const res = await apiFetch(`/api/v1/admin/leads/${lead.id}`, {
      method: 'PATCH',
      body: JSON.stringify(next),
    });
    if (res.ok) load();
  }

  async function submitAddLead(event) {
    event.preventDefault();
    setFormLoading(true);
    setFormError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source: 'manual' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add lead');
      setShowAddForm(false);
      setForm(emptyForm);
      setSection('leads');
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  }

  const cards = useMemo(() => {
    if (!stats) return [];
    return [
      ['Total Leads', stats.total],
      ['New', stats.new],
      ['Contacted', stats.contacted],
      ['Qualified', stats.qualified],
      ['Closed', stats.closed],
      ['Lost', stats.lost],
    ];
  }, [stats]);

  function navigate(sec) {
    setSection(sec);
  }

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <img src="/Asset/Logo NEXONE.png" alt="NEXONE" />
        <nav>
          <a className={section === 'dashboard' ? 'active' : ''} onClick={() => navigate('dashboard')} style={{ cursor: 'pointer' }}>Dashboard</a>
          <a className={section === 'leads' ? 'active' : ''} onClick={() => navigate('leads')} style={{ cursor: 'pointer' }}>Leads</a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <small>NEXONE WORKSPACE</small>
            <h1>{section === 'dashboard' ? 'Dashboard' : 'Manage Leads'}</h1>
          </div>
          <div className="admin-pill">
            <span>{admin?.email || 'Admin'}</span>
            <button onClick={onLogout}>Logout</button>
          </div>
        </header>

        {error && <div className="error">{error}</div>}

        {/* ── Dashboard section ── */}
        {section === 'dashboard' && (
          <section className="stat-grid">
            {cards.map(([label, value]) => (
              <article className="stat-card" key={label} onClick={label !== 'Total Leads' ? () => { setFilterStatus(label.toLowerCase()); navigate('leads'); } : () => navigate('leads')} style={{ cursor: 'pointer' }}>
                <span>{label}</span>
                <strong>{value ?? '—'}</strong>
              </article>
            ))}
          </section>
        )}

        {/* ── Leads section ── */}
        {section === 'leads' && (
          <section className="leads-panel">
            <div className="panel-head">
              <div>
                <small>DEMO REQUESTS</small>
                <h2>Incoming Leads</h2>
              </div>
              <div className="filters">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && load()}
                  placeholder="Search name, company, email..."
                />
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="all">All status</option>
                  {statusOptions.map((s) => <option key={s} value={s}>{labelStatus(s)}</option>)}
                </select>
                <button onClick={load}>Refresh</button>
                <button className="btn-add" onClick={() => setShowAddForm(true)}>+ Add Lead</button>
              </div>
            </div>

            {loading ? (
              <div className="empty">Loading leads...</div>
            ) : leads.length === 0 ? (
              <div className="empty">No leads yet. <span style={{ cursor: 'pointer', color: 'var(--blue, #2563eb)', textDecoration: 'underline' }} onClick={() => setShowAddForm(true)}>Add one manually.</span></div>
            ) : (
              <div className="lead-list">
                {leads.map((lead) => (
                  <article className="lead-card" key={lead.id}>
                    <div>
                      <div className="lead-title">
                        <h3>{lead.fullName}</h3>
                        <span className={`status ${lead.status}`}>{labelStatus(lead.status)}</span>
                      </div>
                      <p>{lead.company} • {lead.mainNeed}</p>
                      <p>
                        <a href={`mailto:${lead.email}`}>{lead.email}</a>
                        {lead.phone ? ` • ${lead.phone}` : ''}
                        {lead.source === 'manual' ? <em style={{ marginLeft: 8, opacity: 0.6, fontSize: '0.8em' }}>manual</em> : ''}
                      </p>
                      {lead.message && <blockquote>{lead.message}</blockquote>}
                    </div>
                    <div className="lead-actions">
                      <select value={lead.status} onChange={(e) => updateLead(lead, { status: e.target.value })}>
                        {statusOptions.map((s) => <option key={s} value={s}>{labelStatus(s)}</option>)}
                      </select>
                      <textarea
                        defaultValue={lead.adminNotes}
                        onBlur={(e) => updateLead(lead, { adminNotes: e.target.value })}
                        placeholder="Internal notes"
                      />
                      <small>{new Date(lead.createdAt).toLocaleString()}</small>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </section>

      {/* ── Add Lead Modal ── */}
      {showAddForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowAddForm(false)}>
          <div className="modal">
            <div className="modal-head">
              <h2>Add Lead Manually</h2>
              <button className="modal-close" onClick={() => setShowAddForm(false)}>✕</button>
            </div>
            <form onSubmit={submitAddLead}>
              <div className="form-grid">
                <label>
                  Full Name <span className="req">*</span>
                  <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
                </label>
                <label>
                  Company <span className="req">*</span>
                  <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} required />
                </label>
                <label>
                  Email <span className="req">*</span>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                </label>
                <label>
                  Phone / WhatsApp
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </label>
                <label className="full">
                  Main Need <span className="req">*</span>
                  <select value={form.mainNeed} onChange={(e) => setForm({ ...form, mainNeed: e.target.value })}>
                    {mainNeedOptions.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </label>
                <label className="full">
                  Notes / Message
                  <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={3} />
                </label>
              </div>
              {formError && <div className="error">{formError}</div>}
              <div className="modal-actions">
                <button type="button" onClick={() => setShowAddForm(false)}>Cancel</button>
                <button type="submit" className="primary" disabled={formLoading}>{formLoading ? 'Saving...' : 'Save Lead'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function labelStatus(status) {
  return status.replace(/^\w/, (l) => l.toUpperCase());
}

createRoot(document.getElementById('root')).render(<App />);
