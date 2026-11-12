import { useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, KeyRound } from 'lucide-react';
import { ModalDialog } from './ModalDialog';

interface TokenDialogProps {
  open: boolean;
  onClose: () => void;
  hasExistingToken: boolean;
  onSaved: () => void;
}

export function TokenDialog({
  open,
  onClose,
  hasExistingToken,
  onSaved,
}: TokenDialogProps) {
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSaving(true);
    try {
      const res = await fetch('/api/config/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Could not validate Mapillary token.');
      } else {
        setSuccess(true);
        setToken('');
        onSaved();
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 700);
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
      title="Host Mapillary Token Setup"
    >
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

      <form id="token-setup-form" onSubmit={handleSubmit} className="field">
        <label htmlFor="mapillary-token-input">
          Mapillary Client Access Token
        </label>
        <input
          id="mapillary-token-input"
          type="password"
          className="input"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="MLY|1234567890|..."
          required
          autoFocus
        />
        <p className="field-hint">
          Saved locally on your machine in <code>.vagabond-config.json</code> (gitignored).
        </p>
      </form>

      {error ? (
        <div className="alert alert--error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {success ? (
        <div className="alert alert--success" role="status">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>Token verified and saved!</span>
        </div>
      ) : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="submit"
          form="token-setup-form"
          className="btn btn--primary"
          disabled={saving || token.trim().length === 0}
        >
          <KeyRound size={16} aria-hidden="true" />
          {saving ? 'Verifying…' : 'Verify & Save Token'}
        </button>
      </div>
    </ModalDialog>
  );
}
