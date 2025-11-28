import React, { useEffect, useMemo, useState } from 'react';
import './App.css';

/**
 * Utility: Determine API base from env with fallback.
 */
// PUBLIC_INTERFACE
function useApiBase() {
  const base = useMemo(() => {
    const envBase = process.env.REACT_APP_API_BASE;
    return (envBase && envBase.trim().length > 0) ? envBase : 'http://localhost:3001';
  }, []);
  return base;
}

/**
 * Format a date string to YYYY-MM-DD (local).
 */
// PUBLIC_INTERFACE
function formatDate(isoString) {
  try {
    const d = new Date(isoString);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  } catch {
    return isoString || '';
  }
}

/**
 * Deterministic color from username -> HSL string.
 */
// PUBLIC_INTERFACE
function userColor(username) {
  const str = String(username ?? '');
  // simple DJB2 hash
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // eslint-disable-next-line no-bitwise
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    // eslint-disable-next-line no-bitwise
    hash = hash & hash;
  }
  const hue = Math.abs(hash) % 360;
  const sat = 65;
  const light = 50;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

/**
 * Safe text rendering: rely on React's default escaping by returning plain text.
 * We also trim for visual cleanliness.
 */
function SafeText({ text }) {
  return <>{(text ?? '').toString()}</>;
}

/**
 * Lightweight hash router using hash fragment (#/route).
 * Defaults to "home".
 */
function useHashRoute() {
  const getRoute = () => {
    const hash = window.location.hash || '#/home';
    const route = hash.replace(/^#\//, '') || 'home';
    return route;
  };
  const [route, setRoute] = useState(getRoute());
  useEffect(() => {
    const handler = () => setRoute(getRoute());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  // PUBLIC_INTERFACE
  const navigate = (to) => {
    const next = `#/` + (to || 'home');
    if (window.location.hash !== next) window.location.hash = next;
    else {
      // force update to re-render if same route (for shareable params changes)
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  };
  return { route, navigate };
}

/**
 * Read ?highlightId=... from URL search params (shareable links).
 */
// PUBLIC_INTERFACE
function useHighlightId() {
  const [highlightId, setHighlightId] = useState(null);
  useEffect(() => {
    const update = () => {
      const sp = new URLSearchParams(window.location.search);
      const v = sp.get('highlightId');
      setHighlightId(v);
    };
    update();
    window.addEventListener('popstate', update);
    window.addEventListener('hashchange', update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener('hashchange', update);
    };
  }, []);
  return highlightId;
}

/**
 * Compute per-user streaks (consecutive daily posts) from oldest-first thoughts.
 * Returns: { byUser: { [username]: { current: number, max: number, days: string[] } }, globalMax: number }
 */
// PUBLIC_INTERFACE
function computeStreaks(thoughts) {
  // Group by user -> set of dates
  const byUserDates = {};
  for (const t of thoughts || []) {
    const u = (t.username ?? '').toString();
    const d = formatDate(t.created_at);
    if (!byUserDates[u]) byUserDates[u] = new Set();
    byUserDates[u].add(d);
  }
  const res = { byUser: {}, globalMax: 0 };
  const todayStr = formatDate(new Date().toISOString());

  function dateMinusOne(dstr) {
    const d = new Date(dstr);
    d.setDate(d.getDate() - 1);
    return formatDate(d.toISOString());
  }

  Object.entries(byUserDates).forEach(([user, dateSet]) => {
    // Sort dates asc
    const dates = Array.from(dateSet).sort();
    // Compute max streak
    let maxStreak = 0;
    let currStreak = 0;
    let last = null;
    for (const ds of dates) {
      if (last) {
        if (ds === last) {
          // same day duplicate shouldn't occur, but ignore
        } else {
          const prev = dateMinusOne(ds);
          if (prev === last) currStreak += 1;
          else currStreak = 1;
        }
      } else {
        currStreak = 1;
      }
      last = ds;
      if (currStreak > maxStreak) maxStreak = currStreak;
    }
    // Compute current streak ending today (or most recent date)
    let current = 0;
    // iterate from latest backwards
    for (let i = dates.length - 1; i >= 0; i--) {
      const ds = dates[i];
      if (current === 0) {
        // If latest date equals today or is some date; start current as 1
        current = 1;
      } else {
        const expected = dateMinusOne(dates[i + (current - 1)]);
        if (ds === expected) current += 1;
        else break;
      }
    }
    res.byUser[user] = { current: current || 0, max: maxStreak || 0, days: dates };
    if (maxStreak > res.globalMax) res.globalMax = maxStreak;
    // If user has today's date ensure current streak is continuous to today
    if (dates.length > 0) {
      const latest = dates[dates.length - 1];
      if (latest !== todayStr) {
        // streak considered up to latest day, not necessarily today
      }
    }
  });

  return res;
}

/**
 * Compute simple word frequency map from thought_texts (client-side)
 * Returns topK descending array of { word, count }
 */
// PUBLIC_INTERFACE
function computeWordFrequency(thoughts, topK = 25) {
  const stop = new Set(['the','a','an','and','or','to','of','in','on','for','is','are','am','i','it','that','this','with','as','at','be','by','from','was','were','but','so','we','you','they','he','she','them','his','her','our','your']);
  const freq = {};
  for (const t of thoughts || []) {
    const text = (t.thought_text || '').toLowerCase();
    const words = text.match(/[a-z0-9']+/g) || [];
    for (const w of words) {
      if (w.length < 2) continue;
      if (stop.has(w)) continue;
      freq[w] = (freq[w] || 0) + 1;
    }
  }
  const arr = Object.entries(freq).map(([word, count]) => ({ word, count }));
  arr.sort((a, b) => b.count - a.count);
  return arr.slice(0, topK);
}

// PUBLIC_INTERFACE
function App() {
  const apiBase = useApiBase();
  const { route, navigate } = useHashRoute();
  const highlightId = useHighlightId();

  // Theme handling (preserve template feature)
  const [theme, setTheme] = useState('light');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Form state
  const [username, setUsername] = useState('');
  const [thoughtText, setThoughtText] = useState('');
  const [errors, setErrors] = useState([]);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // Thoughts list
  const [thoughts, setThoughts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoadError, setInitialLoadError] = useState('');

  // Load thoughts on mount
  useEffect(() => {
    let abort = false;
    async function load() {
      setLoading(true);
      setInitialLoadError('');
      try {
        const res = await fetch(`${apiBase}/thoughts`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch thoughts (${res.status})`);
        }
        const data = await res.json();
        // Ensure array and oldest-first ordering
        const list = Array.isArray(data) ? data : [];
        list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        if (!abort) setThoughts(list);
      } catch (e) {
        if (!abort) setInitialLoadError(e.message || 'Unable to load thoughts');
      } finally {
        if (!abort) setLoading(false);
      }
    }
    load();
    return () => { abort = true; };
  }, [apiBase]);

  // PUBLIC_INTERFACE
  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  // Client-side validation
  function validate() {
    const errs = [];
    if (!username || username.trim().length === 0) {
      errs.push('Username is required.');
    } else if (username.trim().length > 50) {
      errs.push('Username must be at most 50 characters.');
    }
    if (!thoughtText || thoughtText.trim().length === 0) {
      errs.push('Thought text is required.');
    } else if (thoughtText.trim().length > 1000) {
      errs.push('Thought text must be at most 1000 characters.');
    }
    return errs;
  }

  // PUBLIC_INTERFACE
  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');
    const v = validate();
    setErrors(v);
    if (v.length > 0) return;

    try {
      // Include persistent anonymous token and normalize error parsing to avoid "[object Object]"
      function getOrCreateAnonToken() {
        try {
          const key = 'dailyThoughtAnonToken';
          let tok = localStorage.getItem(key);
          if (!tok) {
            const arr = new Uint8Array(16);
            // Use Web Crypto if available for good randomness
            if (window.crypto && window.crypto.getRandomValues) {
              window.crypto.getRandomValues(arr);
            } else {
              // Fallback: Math.random
              for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
            }
            tok = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
            localStorage.setItem(key, tok);
          }
          return tok;
        } catch {
          // Safe fallback token
          return 'fallback-' + String(Date.now());
        }
      }

      const res = await fetch(`${apiBase}/thoughts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          username: username.trim(),
          thought_text: thoughtText.trim(),
          token: getOrCreateAnonToken()
        })
      });

      if (!res.ok) {
        // Try JSON first
        let message = '';
        try {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            const errData = await res.json();
            // Prefer explicit fields
            if (errData) {
              if (typeof errData.detail === 'string' && errData.detail.trim()) {
                message = errData.detail.trim();
              } else if (Array.isArray(errData.detail) && errData.detail.length > 0 && errData.detail[0]?.msg) {
                // FastAPI validation error array
                message = String(errData.detail[0].msg);
              } else if (typeof errData.message === 'string' && errData.message.trim()) {
                message = errData.message.trim();
              } else if (typeof errData.error === 'string' && errData.error.trim()) {
                message = errData.error.trim();
              }
            }
          }
        } catch {
          // ignore
        }
        // Fallback to text body
        if (!message) {
          try {
            const text = await res.text();
            if (typeof text === 'string' && text.trim()) {
              message = text.trim();
            }
          } catch {
            // ignore
          }
        }
        // Final fallback to status text
        if (!message) {
          message = res.statusText || `Submission failed (${res.status})`;
        }
        setSubmitError(message);
        return;
      }

      const created = await res.json();
      // Store edit token if provided (id->token map)
      try {
        if (created && created.id && created.edit_token) {
          const key = 'thought_edit_tokens';
          const current = JSON.parse(localStorage.getItem(key) || '{}');
          current[String(created.id)] = created.edit_token;
          localStorage.setItem(key, JSON.stringify(current));
        }
      } catch {
        // ignore storage errors
      }
      // Append to list and keep oldest-first order (token will be ignored by renderer)
      const next = [...thoughts, created].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      setThoughts(next);

      setSubmitSuccess('Thought submitted successfully.');
      setThoughtText('');
      // Keep username for convenience
    } catch (e) {
      setSubmitError(e.message || 'Network error while submitting.');
    }
  }

  // Derived: calendar groups
  const groupedByDate = useMemo(() => {
    const map = {};
    for (const t of thoughts) {
      const d = formatDate(t.created_at);
      if (!map[d]) map[d] = [];
      map[d].push(t);
    }
    return map;
  }, [thoughts]);

  // Derived: analytics
  const streaks = useMemo(() => computeStreaks(thoughts), [thoughts]);
  const wordTop = useMemo(() => computeWordFrequency(thoughts, 25), [thoughts]);

  // Helpers
  function userBadge(username) {
    const color = userColor(username);
    const style = { borderColor: color, color };
    return (
      <span className="user-badge" style={style} title={`User: ${username}`}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
        <SafeText text={username} />
      </span>
    );
  }

  function streakChip(n, label = 'streak') {
    // simple sparkline-like bars
    const bars = Array.from({ length: Math.min(10, Math.max(1, n)) }, (_, i) => i);
    return (
      <span className="streak-chip" title={`${n} day ${label}`}>
        {n}d
        <span style={{ display: 'inline-flex', gap: 2 }}>
          {bars.map((i) => (
            <span key={i} style={{
              width: 4,
              height: 8 + ((i % 3) * 3),
              background: 'currentColor',
              opacity: 0.7,
              borderRadius: 2
            }} />
          ))}
        </span>
      </span>
    );
  }

  // Calendar generator: simple month range around min/max thoughts
  const calendarDays = useMemo(() => {
    const dates = Object.keys(groupedByDate).sort();
    if (dates.length === 0) return [];
    const start = new Date(dates[0]);
    const end = new Date(dates[dates.length - 1]);
    // Normalize to first/last day of month for a pleasant grid
    const first = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth() + 1, 0);
    const list = [];
    const cur = new Date(first);
    while (cur <= last) {
      list.push(formatDate(cur.toISOString()));
      cur.setDate(cur.getDate() + 1);
    }
    return list;
  }, [groupedByDate]);

  // Local storage helpers for edit tokens
  // Stores a map of { [id: string]: edit_token } as provided by POST /thoughts response
  function getTokenForId(id) {
    try {
      const map = JSON.parse(localStorage.getItem('thought_edit_tokens') || '{}');
      return map ? map[String(id)] : undefined;
    } catch {
      return undefined;
    }
  }


  // Edit UI state
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [editError, setEditError] = useState('');

  async function startEdit(thought) {
    setEditingId(thought.id);
    setEditingText(thought.thought_text);
    setEditError('');
  }
  function cancelEdit() {
    setEditingId(null);
    setEditingText('');
    setEditError('');
  }
  async function submitEdit(thought) {
    setEditError('');
    const newText = (editingText || '').trim();
    if (newText.length === 0 || newText.length > 500) {
      setEditError('Thought text must be 1 to 500 characters.');
      return;
    }
    const token = getTokenForId(thought.id);
    if (!token) {
      setEditError('Missing edit token for this thought.');
      return;
    }
    try {
      const res = await fetch(`${apiBase}/thoughts/${encodeURIComponent(thought.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Edit-Token': token,
        },
        body: JSON.stringify({ thought_text: newText }),
      });
      if (!res.ok) {
        let msg = `Update failed (${res.status})`;
        try {
          const err = await res.json();
          if (err && (err.detail || err.message)) msg = err.detail || err.message;
        } catch { /* ignore */ }
        setEditError(msg);
        return;
      }
      const updated = await res.json();
      // refresh list item locally
      const next = thoughts.map(t => (String(t.id) === String(thought.id) ? { ...t, thought_text: updated.thought_text } : t));
      setThoughts(next);
      cancelEdit();
    } catch (e) {
      setEditError(e.message || 'Network error while updating.');
    }
  }



  // Render sections (routes)
  function renderHome() {
    return (
      <>
        <section className="card" aria-labelledby="submit-title">
          <h2 id="submit-title" className="section-title">Submit Your Thought</h2>

          {errors.length > 0 && (
            <div className="alert alert-error" role="alert" aria-live="assertive">
              <ul className="alert-list">
                {errors.map((err, idx) => (
                  <li key={idx}><SafeText text={err} /></li>
                ))}
              </ul>
            </div>
          )}

          {submitError && (
            <div className="alert alert-error" role="alert" aria-live="assertive">
              <SafeText text={submitError} />
            </div>
          )}
          {submitSuccess && (
            <div className="alert alert-success" role="status" aria-live="polite">
              <SafeText text={submitSuccess} />
            </div>
          )}

          <form className="form-grid" onSubmit={handleSubmit} noValidate>
            <div className="form-field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                name="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g., Alice"
                maxLength={50}
                required
                aria-required="true"
                autoComplete="off"
              />
            </div>

            <div className="form-field">
              <label htmlFor="thought">Thought</label>
              <textarea
                id="thought"
                name="thought"
                value={thoughtText}
                onChange={(e) => setThoughtText(e.target.value)}
                placeholder="Share one thought for today..."
                rows={4}
                maxLength={1000}
                required
                aria-required="true"
              />
            </div>

            <div className="actions">
              <button type="submit" className="btn-primary">Submit Thought</button>
            </div>
          </form>

          <div className="helper-text">
            One thought per user per day. Backend enforces duplicates; duplicate attempts will show an error.
          </div>
        </section>

        <section className="card" aria-labelledby="list-title">
          <h2 id="list-title" className="section-title">All Thoughts</h2>

          {loading && <div className="muted">Loading thoughts…</div>}
          {initialLoadError && (
            <div className="alert alert-error" role="alert" aria-live="assertive">
              <SafeText text={initialLoadError} />
            </div>
          )}

          {!loading && !initialLoadError && thoughts.length === 0 && (
            <div className="muted">No thoughts yet. Be the first to share!</div>
          )}

          <ul className="thought-list">
            {thoughts.map(t => {
              const key = t.id ?? `${t.username}-${t.created_at}`;
              const isHighlight = highlightId && String(t.id) === String(highlightId);
              const hasToken = !!getTokenForId(t.id);
              const isEditing = editingId && String(editingId) === String(t.id);
              return (
                <li className={`thought-item ${isHighlight ? 'highlight' : ''}`} key={key} id={`thought-${t.id}`}>
                  <div className="thought-meta" style={{ justifyContent: 'space-between' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span className="thought-date">{formatDate(t.created_at)}</span>
                      <span className="dot">•</span>
                      <span className="thought-user">
                        {userBadge(t.username)}
                      </span>
                      <span className="dot">•</span>
                      {streaks.byUser[t.username] ? streakChip(streaks.byUser[t.username].current, 'streak') : null}
                    </span>
                    {!hasToken && !isEditing && (
                      <span className="muted" title="You can only edit items created from this browser (ownership token missing).">
                        Cannot edit here — ownership token not found on this device.
                      </span>
                    )}
                    {hasToken && !isEditing && (
                      <span style={{ display: 'inline-flex', gap: 8 }}>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ padding: '6px 10px' }}
                          onClick={() => startEdit(t)}
                          aria-label={`Edit thought ${t.id}`}
                          title="Edit"
                        >
                          Edit
                        </button>
                      </span>
                    )}
                  </div>
                  {!isEditing ? (
                    <div className="thought-text">
                      <SafeText text={t.thought_text} />
                    </div>
                  ) : (
                    <div className="form-grid" style={{ marginTop: 8 }}>
                      {editError && (
                        <div className="alert alert-error" role="alert" aria-live="assertive">
                          <SafeText text={editError} />
                        </div>
                      )}
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        rows={4}
                        maxLength={500}
                        aria-label="Edit thought text"
                      />
                      <div className="actions" style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="btn-primary" onClick={() => submitEdit(t)}>Save</button>
                        <button type="button" className="btn-primary" style={{ background: '#6B7280' }} onClick={cancelEdit}>Cancel</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

        </section>
      </>
    );
  }

  function renderCalendar() {
    return (
      <section className="card" aria-labelledby="calendar-title">
        <h2 id="calendar-title" className="section-title">Calendar View</h2>
        {calendarDays.length === 0 ? (
          <div className="muted">No thoughts to display.</div>
        ) : (
          <div className="calendar-grid" role="grid">
            {calendarDays.map((ds) => {
              const items = groupedByDate[ds] || [];
              return (
                <div key={ds} className="calendar-cell" role="gridcell" aria-label={`Day ${ds} has ${items.length} thoughts`}>
                  <div className="calendar-date">{ds}</div>
                  <div className="calendar-bubbles">
                    {items.map((t) => {
                      const color = userColor(t.username);
                      return <span key={t.id ?? `${t.username}-${t.created_at}`} className="bubble" title={`${t.username}: ${t.thought_text}`} style={{ background: color }} />;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  function renderAnalytics() {
    const users = Object.keys(streaks.byUser).sort();
    return (
      <section className="card" aria-labelledby="analytics-title">
        <h2 id="analytics-title" className="section-title">Analytics</h2>
        {thoughts.length === 0 ? (
          <div className="muted">No data yet.</div>
        ) : (
          <div className="grid grid-2">
            <div>
              <h3 className="section-title" style={{ fontSize: 16 }}>User Streaks</h3>
              <ul className="thought-list">
                {users.map((u) => {
                  const s = streaks.byUser[u];
                  return (
                    <li className="thought-item" key={u}>
                      <div className="thought-meta" style={{ justifyContent: 'space-between' }}>
                        <span>{userBadge(u)}</span>
                        <span style={{ display: 'inline-flex', gap: 8 }}>
                          {streakChip(s.current, 'current')}
                          {streakChip(s.max, 'max')}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <h3 className="section-title" style={{ fontSize: 16 }}>Top Words</h3>
              <ul className="thought-list">
                {wordTop.map(({ word, count }) => (
                  <li className="thought-item" key={word}>
                    <div className="thought-meta" style={{ justifyContent: 'space-between' }}>
                      <span><SafeText text={word} /></span>
                      <span className="muted">{count}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
    );
  }

  // Auto-scroll to highlighted thought (shareable link UX)
  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`thought-${highlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightId, thoughts]);

  return (
    <div className="App">
      <header className="app-navbar" role="banner">
        <div className="container">
          <div className="brand">
            <span className="brand-primary">Daily</span>
            <span className="brand-secondary">Thought Chain</span>
          </div>

          <nav className="nav-pills" aria-label="Primary">
            <button className={`nav-pill ${route === 'home' ? 'active' : ''}`} onClick={() => navigate('home')} type="button">Home</button>
            <button className={`nav-pill ${route === 'calendar' ? 'active' : ''}`} onClick={() => navigate('calendar')} type="button">Calendar</button>
            <button className={`nav-pill ${route === 'analytics' ? 'active' : ''}`} onClick={() => navigate('analytics')} type="button">Analytics</button>
          </nav>

          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            type="button"
          >
            {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
          </button>
        </div>
      </header>

      <main className="container main-content" role="main">
        {route === 'calendar' ? renderCalendar() : route === 'analytics' ? renderAnalytics() : renderHome()}
      </main>

      <footer className="app-footer" role="contentinfo">
        <div className="container muted">
          API Base: <code>{apiBase}</code>
        </div>
      </footer>
    </div>
  );
}

export default App;
