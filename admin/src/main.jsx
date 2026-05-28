import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8089';
const statusOptions = ['new', 'contacted', 'qualified', 'closed', 'lost'];

function apiFetch(path, options = {}) {
  const token = localStorage.getItem('nexoneAdminToken');
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
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
  const [email, setEmail] = useState('admin@nexone.local');
  const [password, setPassword] = useState('Admin123!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
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
          <img src="/Logo NEXONE.png" alt="NEXONE" />
          <span>Leads Admin</span>
        </div>
        <h1>Welcome back</h1>
        <p>Sign in to view demo requests and manage incoming NEXONE leads.</p>
        <form onSubmit={submit}>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
          </label>
          {error && <div className="error">{error}</div>}
          <button className="primary" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
        </form>
      </section>
    </main>
  );
}

function Dashboard({ admin, onLogout }) {
  const [stats, setStats] = useState(null);
  const [leads, setLeads] = useState([]);
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (query) params.set('q', query);
      const [statsRes, leadsRes] = await Promise.all([
        apiFetch('/api/v1/admin/dashboard'),
        apiFetch(`/api/v1/admin/leads?${params}`)
      ]);
      const statsData = await statsRes.json();
      const leadsData = await leadsRes.json();
      if (!statsRes.ok || !leadsRes.ok) throw new Error(statsData.error || leadsData.error || 'Failed to load admin data');
      setStats(statsData.stats);
      setLeads(leadsData.leads || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [status]);

  async function updateLead(lead, patch) {
    const next = { status: lead.status, adminNotes: lead.adminNotes, ...patch };
    const res = await apiFetch(`/api/v1/admin/leads/${lead.id}`, {
      method: 'PATCH',
      body: JSON.stringify(next)
    });
    if (res.ok) load();
  }

  const cards = useMemo(() => {
    if (!stats) return [];
    return [
      ['Total Leads', stats.total],
      ['New', stats.new],
      ['Contacted', stats.contacted],
      ['Qualified', stats.qualified],
      ['Closed', stats.closed],
      ['Lost', stats.lost]
    ];
  }, [stats]);

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <img src="/Logo NEXONE.png" alt="NEXONE" />
        <nav>
          <a className="active" href="#dashboard">Dashboard</a>
          <a href="#leads">Leads</a>
        </nav>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <small>NEXONE WORKSPACE</small>
            <h1>Lead Dashboard</h1>
          </div>
          <div className="admin-pill">
            <span>{admin?.email || 'Admin'}</span>
            <button onClick={onLogout}>Logout</button>
          </div>
        </header>

        {error && <div className="error">{error}</div>}

        <section className="stat-grid" id="dashboard">
          {cards.map(([label, value]) => (
            <article className="stat-card" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </section>

        <section className="leads-panel" id="leads">
          <div className="panel-head">
            <div>
              <small>DEMO REQUESTS</small>
              <h2>Incoming Leads</h2>
            </div>
            <div className="filters">
              <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && load()} placeholder="Search name, company, email..." />
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">All status</option>
                {statusOptions.map((item) => <option key={item} value={item}>{labelStatus(item)}</option>)}
              </select>
              <button onClick={load}>Refresh</button>
            </div>
          </div>

          {loading ? (
            <div className="empty">Loading leads...</div>
          ) : leads.length === 0 ? (
            <div className="empty">No leads yet.</div>
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
                    <p><a href={`mailto:${lead.email}`}>{lead.email}</a>{lead.phone ? ` • ${lead.phone}` : ''}</p>
                    {lead.message && <blockquote>{lead.message}</blockquote>}
                  </div>
                  <div className="lead-actions">
                    <select value={lead.status} onChange={(event) => updateLead(lead, { status: event.target.value })}>
                      {statusOptions.map((item) => <option key={item} value={item}>{labelStatus(item)}</option>)}
                    </select>
                    <textarea defaultValue={lead.adminNotes} onBlur={(event) => updateLead(lead, { adminNotes: event.target.value })} placeholder="Internal notes" />
                    <small>{new Date(lead.createdAt).toLocaleString()}</small>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function labelStatus(status) {
  return status.replace(/^\w/, (letter) => letter.toUpperCase());
}

createRoot(document.getElementById('root')).render(<App />);
