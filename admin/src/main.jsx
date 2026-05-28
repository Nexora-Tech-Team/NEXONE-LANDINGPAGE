import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
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

const STATUS_COLORS = {
  new: '#3b82f6',
  contacted: '#4c1d95',
  qualified: '#f59e0b',
  closed: '#10b981',
  lost: '#ef4444',
};
const CHART_COLORS = ['#1f6bff', '#4c1d95', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];
const NEED_SHORT = {
  'Integrated Business Platform': 'Integrated Platform',
  'Project & Operations Management': 'Project & Ops',
  'Finance & Billing Monitoring': 'Finance & Billing',
  'HR & Team Activity Monitoring': 'HR & Team',
  'Document & Approval System': 'Doc & Approval',
};

function buildTimeData(leads) {
  const now = new Date();
  const dayMap = {};
  leads.forEach((l) => {
    const day = l.createdAt.slice(0, 10);
    dayMap[day] = (dayMap[day] || 0) + 1;
  });
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (13 - i));
    const key = d.toISOString().slice(0, 10);
    return {
      date: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`,
      Leads: dayMap[key] || 0,
    };
  });
}

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

/* ─── App ─────────────────────────────────────────────── */
function App() {
  const [token, setToken] = useState(localStorage.getItem('nexoneAdminToken') || '');
  const [admin, setAdmin] = useState(null);

  useEffect(() => {
    if (!token) return;
    apiFetch('/api/v1/admin/me')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setAdmin(d.admin))
      .catch(() => { localStorage.removeItem('nexoneAdminToken'); setToken(''); });
  }, [token]);

  const handleLogin = (t, a) => { localStorage.setItem('nexoneAdminToken', t); setToken(t); setAdmin(a); };
  const logout = () => { localStorage.removeItem('nexoneAdminToken'); setToken(''); setAdmin(null); };

  if (!token) return <Login onLogin={handleLogin} />;
  return <Dashboard admin={admin} onLogout={logout} />;
}

/* ─── Login ───────────────────────────────────────────── */
function newCaptcha() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { a, b };
}

function Login({ onLogin }) {
  const [email, setEmail] = useState(() => localStorage.getItem('nexoneRememberEmail') || '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => !!localStorage.getItem('nexoneRememberEmail'));
  const [captcha, setCaptcha] = useState(newCaptcha);
  const [captchaInput, setCaptchaInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (parseInt(captchaInput, 10) !== captcha.a + captcha.b) {
      setError('Jawaban verifikasi salah. Coba lagi.');
      setCaptcha(newCaptcha());
      setCaptchaInput('');
      return;
    }
    setLoading(true); setError('');
    try {
      const res = await apiFetch('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Login failed');
      if (remember) localStorage.setItem('nexoneRememberEmail', email);
      else localStorage.removeItem('nexoneRememberEmail');
      onLogin(d.token, d.admin);
    } catch (err) {
      setError(err.message);
      setCaptcha(newCaptcha());
      setCaptchaInput('');
    }
    finally { setLoading(false); }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="brand-lockup">
          <img src="/Asset/Logo NEXONE.png" alt="NEXONE" />
          <span>Leads Admin</span>
        </div>
        <h1>Welcome back</h1>
        <p>Sign in to manage incoming NEXONE leads.</p>
        <form onSubmit={submit}>
          <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required /></label>
          <label>Password<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required /></label>
          <label className="captcha-label">
            Verifikasi: berapa {captcha.a} + {captcha.b}?
            <input
              value={captchaInput}
              onChange={(e) => setCaptchaInput(e.target.value)}
              type="number"
              placeholder="Jawaban"
              required
              autoComplete="off"
            />
          </label>
          <label className="remember-label">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Ingat saya
          </label>
          {error && <div className="error">{error}</div>}
          <button className="primary" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </section>
    </main>
  );
}

/* ─── Dashboard ───────────────────────────────────────── */
const emptyForm = { fullName: '', company: '', email: '', phone: '', mainNeed: mainNeedOptions[0], message: '' };

function Dashboard({ admin, onLogout }) {
  const [section, setSection] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
  const [refreshKey, setRefreshKey] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotif, setShowNotif] = useState(false);
  const knownLeadIds = useRef(null);

  async function load() {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (query) params.set('q', query);
      const [sRes, lRes] = await Promise.all([
        apiFetch('/api/v1/admin/dashboard'),
        apiFetch(`/api/v1/admin/leads?${params}`),
      ]);
      const sd = await sRes.json(); const ld = await lRes.json();
      if (!sRes.ok || !lRes.ok) throw new Error(sd.error || ld.error || 'Failed to load');
      setStats(sd.stats);
      const freshLeads = ld.leads || [];
      setLeads(freshLeads);
      setRefreshKey((k) => k + 1);
      if (knownLeadIds.current === null) {
        knownLeadIds.current = new Set(freshLeads.map((l) => l.id));
      } else {
        const newOnes = freshLeads.filter((l) => !knownLeadIds.current.has(l.id));
        if (newOnes.length > 0) {
          const bySource = {};
          newOnes.forEach((l) => {
            const src = l.source === 'manual' ? 'Manual' : 'Landing Page (Web)';
            bySource[src] = (bySource[src] || 0) + 1;
          });
          const msgs = Object.entries(bySource).map(([src, count]) => ({
            id: `${Date.now()}-${src}`,
            text: `${count} lead${count > 1 ? 's' : ''} baru dari ${src}`,
            time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            read: false,
          }));
          setNotifications((prev) => [...msgs, ...prev].slice(0, 20));
          newOnes.forEach((l) => knownLeadIds.current.add(l.id));
        }
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [filterStatus]);

  useEffect(() => {
    if (section !== 'dashboard') return;
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [section]);

  async function updateLead(lead, patch) {
    const next = { status: lead.status, adminNotes: lead.adminNotes, ...patch };
    const res = await apiFetch(`/api/v1/admin/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify(next) });
    if (res.ok) load();
  }

  async function deleteLead(lead) {
    if (!window.confirm(`Hapus lead "${lead.fullName}" dari ${lead.company}?`)) return;
    const res = await apiFetch(`/api/v1/admin/leads/${lead.id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) load();
  }

  async function submitAddLead(e) {
    e.preventDefault(); setFormLoading(true); setFormError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, source: 'manual' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to add lead');
      setShowAddForm(false); setForm(emptyForm); setSection('leads'); load();
    } catch (err) { setFormError(err.message); }
    finally { setFormLoading(false); }
  }

  /* ── chart data ── */
  const { statusData, needData, sourceData, timeData, recentLeads } = useMemo(() => {
    const allLeads = leads; // use full unfiltered — we load all on dashboard

    const statusMap = { new: 0, contacted: 0, qualified: 0, closed: 0, lost: 0 };
    allLeads.forEach((l) => { if (statusMap[l.status] !== undefined) statusMap[l.status]++; });
    const statusData = Object.entries(statusMap)
      .filter(([, v]) => v > 0)
      .map(([status, value]) => ({ name: labelStatus(status), value, status }));

    const needMap = {};
    allLeads.forEach((l) => { needMap[l.mainNeed] = (needMap[l.mainNeed] || 0) + 1; });
    const needData = Object.entries(needMap)
      .map(([name, value]) => ({ name: NEED_SHORT[name] || name, value }))
      .sort((a, b) => b.value - a.value);

    const srcMap = {};
    allLeads.forEach((l) => { const s = l.source || 'landing_page'; srcMap[s] = (srcMap[s] || 0) + 1; });
    const sourceData = Object.entries(srcMap).map(([k, value]) => ({
      name: k === 'manual' ? 'Manual' : 'Landing Page (Web)', value,
    }));

    const timeData = buildTimeData(allLeads);
    const recentLeads = [...allLeads].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8);

    return { statusData, needData, sourceData, timeData, recentLeads };
  }, [leads]);

  /* ── KPI cards ── */
  const kpiCards = useMemo(() => {
    if (!stats) return [];
    const conv = stats.total ? Math.round((stats.closed / stats.total) * 100) : 0;
    return [
      { label: 'Total', value: stats.total, color: '#1f6bff', icon: '📋', sub: 'All leads', status: null },
      { label: 'New', value: stats.new, color: STATUS_COLORS.new, icon: '🆕', sub: 'Awaiting action', status: 'new' },
      { label: 'Contacted', value: stats.contacted, color: STATUS_COLORS.contacted, icon: '📞', sub: 'In progress', status: 'contacted' },
      { label: 'Qualified', value: stats.qualified, color: STATUS_COLORS.qualified, icon: '⭐', sub: 'Hot leads', status: 'qualified' },
      { label: 'Closed', value: stats.closed, color: STATUS_COLORS.closed, icon: '✅', sub: 'Won', status: 'closed' },
      { label: 'Conv. Rate', value: `${conv}%`, color: '#06b6d4', icon: '📈', sub: 'Closed / Total', status: null },
    ];
  }, [stats]);

  function goLeads(status) {
    if (status) setFilterStatus(status);
    setSection('leads');
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: '#fff', border: '1px solid #dce6f7', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
        <p style={{ margin: 0, color: '#071b56', fontWeight: 700 }}>{label}</p>
        {payload.map((p) => <p key={p.name} style={{ margin: '2px 0', color: p.color }}>{p.name}: <b>{p.value}</b></p>)}
      </div>
    );
  };

  return (
    <main className={`admin-shell${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          {sidebarOpen && <img src="/Asset/Logo NEXONE.png" alt="NEXONE" />}
          <button className="sidebar-toggle" onClick={() => setSidebarOpen((o) => !o)} title={sidebarOpen ? 'Collapse' : 'Expand'}>
            {sidebarOpen ? '‹' : '›'}
          </button>
        </div>
        <nav>
          <a className={section === 'dashboard' ? 'active' : ''} onClick={() => setSection('dashboard')} style={{ cursor: 'pointer' }} title="Dashboard">
            <span className="nav-icon">📊</span>{sidebarOpen && ' Dashboard'}
          </a>
          <a className={section === 'leads' ? 'active' : ''} onClick={() => setSection('leads')} style={{ cursor: 'pointer' }} title="Leads">
            <span className="nav-icon">👥</span>{sidebarOpen && ' Leads'}
          </a>
        </nav>
        <div className="sidebar-footer">
          <a className="nav-logout" onClick={onLogout} style={{ cursor: 'pointer' }} title="Logout">
            <span className="nav-icon">🚪</span>{sidebarOpen && ' Logout'}
          </a>
        </div>
      </aside>

      {/* ── Workspace ── */}
      <section className="workspace">
        <header className="topbar">
          <div>
            <small>NEXONE WORKSPACE</small>
            <h1>{section === 'dashboard' ? 'Dashboard Monitoring Leads NEXONE' : 'Manage Leads'}</h1>
          </div>
          <div className="admin-pill">
            <div className="notif-wrap">
              <button
                className="notif-btn"
                onClick={() => {
                  if (showNotif) {
                    setShowNotif(false);
                    setNotifications([]);
                  } else {
                    setShowNotif(true);
                  }
                }}
                title="Notifikasi"
              >
                🔔
                {notifications.filter((n) => !n.read).length > 0 && (
                  <span className="notif-badge">{notifications.filter((n) => !n.read).length}</span>
                )}
              </button>
              {showNotif && (
                <div className="notif-dropdown">
                  <div className="notif-header">Notifikasi</div>
                  {notifications.length === 0 ? (
                    <div className="notif-empty">Belum ada notifikasi</div>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className="notif-item">
                        <span className="notif-dot">🟢</span>
                        <div className="notif-body">
                          <p>{n.text}</p>
                          <small>{n.time}</small>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <span>{admin?.email || 'Admin'}</span>
          </div>
        </header>

        {error && <div className="error">{error}</div>}

        {/* ════════════════ DASHBOARD ════════════════ */}
        {section === 'dashboard' && (
          <div className="dashboard-content">

            {/* KPI Row */}
            <div className="kpi-row">
              {kpiCards.map((card) => (
                <div
                  key={card.label}
                  className="kpi-card"
                  style={{ '--kpi-color': card.color }}
                  onClick={() => goLeads(card.status)}
                >
                  <div className="kpi-icon">{card.icon}</div>
                  <div className="kpi-value">{loading ? '—' : card.value}</div>
                  <div className="kpi-label">{card.label}</div>
                  <div className="kpi-sub">{card.sub}</div>
                </div>
              ))}
            </div>

            {/* Charts Row 1: Donut + Area */}
            <div className="chart-grid two-col">
              <div className="chart-card">
                <h3 className="chart-title">Status Distribution</h3>
                {statusData.length === 0 ? <div className="chart-empty">No data yet</div> : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart key={refreshKey}>
                      <Pie
                        data={statusData}
                        cx="50%" cy="50%"
                        innerRadius={65} outerRadius={100}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {statusData.map((entry) => (
                          <Cell key={entry.status} fill={STATUS_COLORS[entry.status]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend iconType="circle" iconSize={10} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="chart-card">
                <h3 className="chart-title">Lead Trend — 14 Days</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart key={refreshKey} data={timeData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1f6bff" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#1f6bff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f4ff" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={1} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone" dataKey="Leads"
                      stroke="#1f6bff" fill="url(#areaGrad)"
                      strokeWidth={2.5}
                      dot={{ r: 3.5, fill: '#1f6bff', strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Charts Row 2: Horiz Bar + Source Pie */}
            <div className="chart-grid two-col">
              <div className="chart-card">
                <h3 className="chart-title">Leads by Main Need</h3>
                {needData.length === 0 ? <div className="chart-empty">No data yet</div> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart key={refreshKey} data={needData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="value" name="Leads" radius={[0, 6, 6, 0]}>
                        {needData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="chart-card">
                <h3 className="chart-title">Lead Source</h3>
                {sourceData.length === 0 ? <div className="chart-empty">No data yet</div> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart key={refreshKey}>
                      <Pie
                        data={sourceData}
                        cx="50%" cy="48%"
                        outerRadius={80}
                        dataKey="value"
                        labelLine={false}
                        label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                          if (percent < 0.05) return null;
                          const R = Math.PI / 180;
                          const r = innerRadius + (outerRadius - innerRadius) * 0.55;
                          const x = cx + r * Math.cos(-midAngle * R);
                          const y = cy + r * Math.sin(-midAngle * R);
                          return (
                            <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700}>
                              {`${(percent * 100).toFixed(0)}%`}
                            </text>
                          );
                        }}
                      >
                        {sourceData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend iconType="circle" iconSize={10} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Recent Leads Table */}
            <div className="chart-card">
              <div className="chart-title-row">
                <h3 className="chart-title">Recent Leads</h3>
                <button className="btn-text" onClick={() => setSection('leads')}>View all →</button>
              </div>
              {loading ? (
                <div className="chart-empty">Loading…</div>
              ) : recentLeads.length === 0 ? (
                <div className="chart-empty">No leads yet.</div>
              ) : (
                <div className="table-wrap">
                  <table className="leads-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Company</th>
                        <th>Main Need</th>
                        <th>Status</th>
                        <th>Source</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentLeads.map((lead) => (
                        <tr key={lead.id}>
                          <td><strong>{lead.fullName}</strong></td>
                          <td>{lead.company}</td>
                          <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {NEED_SHORT[lead.mainNeed] || lead.mainNeed}
                          </td>
                          <td><span className={`status ${lead.status}`}>{labelStatus(lead.status)}</span></td>
                          <td>
                            <span className="source-badge">
                              {lead.source === 'manual' ? '✏️ Manual' : '🌐 Web'}
                            </span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap', color: '#53627e', fontSize: '0.85em' }}>
                            {new Date(lead.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ════════════════ LEADS ════════════════ */}
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
                  placeholder="Search name, company, email…"
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
              <div className="empty">Loading leads…</div>
            ) : leads.length === 0 ? (
              <div className="empty">
                No leads yet.{' '}
                <span style={{ cursor: 'pointer', color: '#1f6bff', textDecoration: 'underline' }} onClick={() => setShowAddForm(true)}>
                  Add one manually.
                </span>
              </div>
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
                        {lead.source === 'manual' && <em style={{ marginLeft: 8, opacity: 0.6, fontSize: '0.8em' }}>manual</em>}
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
                      <div className="lead-meta">
                        <small>{new Date(lead.createdAt).toLocaleString()}</small>
                        <button className="btn-delete" onClick={() => deleteLead(lead)}>Hapus</button>
                      </div>
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
                <label>Full Name <span className="req">*</span><input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></label>
                <label>Company <span className="req">*</span><input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} required /></label>
                <label>Email <span className="req">*</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
                <label>Phone / WhatsApp<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                <label className="full">Main Need <span className="req">*</span>
                  <select value={form.mainNeed} onChange={(e) => setForm({ ...form, mainNeed: e.target.value })}>
                    {mainNeedOptions.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </label>
                <label className="full">Notes / Message<textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={3} /></label>
              </div>
              {formError && <div className="error">{formError}</div>}
              <div className="modal-actions">
                <button type="button" onClick={() => setShowAddForm(false)}>Cancel</button>
                <button type="submit" className="primary" disabled={formLoading}>{formLoading ? 'Saving…' : 'Save Lead'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function labelStatus(s) { return s.replace(/^\w/, (l) => l.toUpperCase()); }

createRoot(document.getElementById('root')).render(<App />);
