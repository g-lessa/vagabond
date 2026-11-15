import { useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, KeyRound, Globe, Navigation } from 'lucide-react';
import { ModalDialog } from './ModalDialog';

interface TokenDialogProps {
  open: boolean;
  onClose: () => void;
  hasExistingToken: boolean;
  hasExistingGoogleKey?: boolean;
  onSaved: () => void;
}

export function TokenDialog({
  open,
  onClose,
  hasExistingToken,
  hasExistingGoogleKey = false,
  onSaved,
}: TokenDialogProps) {
  const [activeTab, setActiveTab] = useState<'mapillary' | 'google'>('mapillary');
  const [mapillaryToken, setMapillaryToken] = useState('');
  const [googleKey, setGoogleKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSaveMapillary(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await fetch('/api/config/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: mapillaryToken }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not validate Mapillary token.');
      } else {
        setSuccess('Mapillary token verified and saved!');
        setMapillaryToken('');
        onSaved();
        setTimeout(() => {
          setSuccess(null);
          onClose();
        }, 800);
      }
    } catch {
      setError('Failed to reach host server.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveGoogle(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await fetch('/api/config/google-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: googleKey }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not validate Google Maps API key.');
      } else {
        setSuccess('Google Maps API key verified and saved!');
        setGoogleKey('');
        onSaved();
        setTimeout(() => {
          setSuccess(null);
          onClose();
        }, 800);
      }
    } catch {
      setError('Failed to reach host server.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Host Street Imagery API Keys"
    >
      <div className="preset-row" role="tablist" style={{ marginBlockEnd: '0.75rem' }}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'mapillary'}
          className="pill-btn"
          onClick={() => {
            setActiveTab('mapillary');
            setError(null);
            setSuccess(null);
          }}
        >
          <Navigation size={14} style={{ verticalAlign: 'middle', marginInlineEnd: '0.3rem' }} aria-hidden="true" />
          Mapillary (Free 360°) {hasExistingToken ? '✓' : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'google'}
          className="pill-btn"
          onClick={() => {
            setActiveTab('google');
            setError(null);
            setSuccess(null);
          }}
        >
          <Globe size={14} style={{ verticalAlign: 'middle', marginInlineEnd: '0.3rem' }} aria-hidden="true" />
          Google Street View (BYO Key) {hasExistingGoogleKey ? '✓' : ''}
        </button>
      </div>

      {activeTab === 'mapillary' ? (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <p style={{ margin: 0 }}>
            MapillaryJS street imagery is free, and only the <strong>host</strong>{' '}
            needs to paste a free Client Access Token once. Friends joining your
            room do not need an account.
          </p>

          <ol style={{ margin: 0, paddingInlineStart: '1.25rem', display: 'grid', gap: '0.35rem', fontSize: '0.9rem' }}>
            <li>
              Sign in at{' '}
              <a
                href="https://www.mapillary.com/dashboard/developers"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--accent-secondary)' }}
              >
                Mapillary Developer Dashboard{' '}
                <ExternalLink size={13} style={{ verticalAlign: 'middle' }} aria-hidden="true" />
              </a>
            </li>
            <li>Click <strong>Register Application</strong> (enable <em>Read</em> access).</li>
            <li>Copy your <strong>Client Token</strong> (starts with <code>MLY|...</code>) and paste it below.</li>
          </ol>

          {hasExistingToken ? (
            <div className="alert alert--success">
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>A valid Mapillary token is currently configured on this host.</span>
            </div>
          ) : null}

          <form id="mapillary-token-form" onSubmit={handleSaveMapillary} className="field">
            <label htmlFor="mapillary-token-input">
              Mapillary Client Access Token
            </label>
            <input
              id="mapillary-token-input"
              type="password"
              className="input"
              value={mapillaryToken}
              onChange={(e) => setMapillaryToken(e.target.value)}
              placeholder="MLY|1234567890|..."
              required
              autoFocus
            />
            <p className="field-hint">
              Saved locally on your machine in <code>.vagabond-config.json</code> (gitignored).
            </p>
          </form>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <p style={{ margin: 0 }}>
            Play with authentic <strong>Google Street View</strong> panoramas worldwide! Road and city names are automatically hidden to maintain fair gameplay.
          </p>

          <ol style={{ margin: 0, paddingInlineStart: '1.25rem', display: 'grid', gap: '0.35rem', fontSize: '0.9rem' }}>
            <li>
              Go to{' '}
              <a
                href="https://console.cloud.google.com/google/maps-apis/credentials"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--accent-secondary)' }}
              >
                Google Cloud Console Credentials{' '}
                <ExternalLink size={13} style={{ verticalAlign: 'middle' }} aria-hidden="true" />
              </a>
            </li>
            <li>Create an API Key with <strong>Street View Static API</strong> and <strong>Maps JavaScript API</strong> enabled.</li>
            <li>Paste your key below. It is stored safely on your machine only.</li>
          </ol>

          {hasExistingGoogleKey ? (
            <div className="alert alert--success">
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>A valid Google Maps API Key is currently configured on this host.</span>
            </div>
          ) : null}

          <form id="google-key-form" onSubmit={handleSaveGoogle} className="field">
            <label htmlFor="google-api-key-input">
              Google Maps API Key
            </label>
            <input
              id="google-api-key-input"
              type="password"
              className="input"
              value={googleKey}
              onChange={(e) => setGoogleKey(e.target.value)}
              placeholder="AIzaSy..."
              required
              autoFocus
            />
            <p className="field-hint">
              Saved locally on your machine in <code>.vagabond-config.json</code> (gitignored).
            </p>
          </form>
        </div>
      )}

      {error ? (
        <div className="alert alert--error" role="alert" style={{ marginBlockStart: '0.5rem' }}>
          <AlertCircle size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {success ? (
        <div className="alert alert--success" role="status" style={{ marginBlockStart: '0.5rem' }}>
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>{success}</span>
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginBlockStart: '0.75rem' }}>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        {activeTab === 'mapillary' ? (
          <button
            type="submit"
            form="mapillary-token-form"
            className="btn btn--primary"
            disabled={saving || mapillaryToken.trim().length === 0}
          >
            <KeyRound size={16} aria-hidden="true" />
            {saving ? 'Verifying…' : 'Save Mapillary Token'}
          </button>
        ) : (
          <button
            type="submit"
            form="google-key-form"
            className="btn btn--primary"
            disabled={saving || googleKey.trim().length === 0}
          >
            <KeyRound size={16} aria-hidden="true" />
            {saving ? 'Verifying…' : 'Save Google Maps Key'}
          </button>
        )}
      </div>
    </ModalDialog>
  );
}
