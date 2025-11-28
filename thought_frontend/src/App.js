import React, { useEffect, useMemo, useState } from 'react';
import './App.css';

/**
 * Utility: Determine API base from env with fallback.
 */
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
 * Safe text rendering: rely on React's default escaping by returning plain text.
 * We also trim for visual cleanliness.
 */
function SafeText({ text }) {
  return <>{(text ?? '').toString()}</>;
}

// PUBLIC_INTERFACE
function App() {
  const apiBase = useApiBase();

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
      const res = await fetch(`${apiBase}/thoughts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          username: username.trim(),
          thought_text: thoughtText.trim()
        })
      });

      if (!res.ok) {
        // Try to parse error message from backend
        let message = `Submission failed (${res.status})`;
        try {
          const errData = await res.json();
          if (errData && (errData.detail || errData.message || errData.error)) {
            message = errData.detail || errData.message || errData.error;
          }
        } catch {
          // ignore json parse errors
        }
        setSubmitError(message);
        return;
      }

      const created = await res.json();
      // Append to list and keep oldest-first order
      const next = [...thoughts, created].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      setThoughts(next);

      setSubmitSuccess('Thought submitted successfully.');
      setThoughtText('');
      // Keep username for convenience
    } catch (e) {
      setSubmitError(e.message || 'Network error while submitting.');
    }
  }

  return (
    <div className="App">
      <header className="app-navbar" role="banner">
        <div className="container">
          <div className="brand">
            <span className="brand-primary">Daily</span>
            <span className="brand-secondary">Thought Chain</span>
          </div>
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
            {thoughts.map(t => (
              <li className="thought-item" key={t.id ?? `${t.username}-${t.created_at}`}>
                <div className="thought-meta">
                  <span className="thought-date">{formatDate(t.created_at)}</span>
                  <span className="dot">•</span>
                  <span className="thought-user">
                    <SafeText text={t.username} />
                  </span>
                </div>
                <div className="thought-text">
                  <SafeText text={t.thought_text} />
                </div>
              </li>
            ))}
          </ul>
        </section>
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
