import { useState } from 'react';
import {
  Check,
  Copy,
  Globe,
  Laptop,
  Play,
  Square,
  Terminal,
} from 'lucide-react';
import { ModalDialog } from './ModalDialog';
import type { ServerInfoClient } from '../hooks/useSocket';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  roomCode: string;
  serverInfo: ServerInfoClient;
  onRefreshServerInfo: () => Promise<void>;
}

export function ShareDialog({
  open,
  onClose,
  roomCode,
  serverInfo,
  onRefreshServerInfo,
}: ShareDialogProps) {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);

  const currentOriginInvite = `${window.location.origin}/?room=${roomCode}`;
  const tunnelInvite = serverInfo.tunnelUrl
    ? `${serverInfo.tunnelUrl}/?room=${roomCode}`
    : null;

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(label);
      setTimeout(() => setCopiedText(null), 1800);
    } catch {
      // ignore clipboard denial
    }
  }

  async function handleStartTunnel() {
    setTunnelError(null);
    setTunnelBusy(true);
    try {
      const res = await fetch('/api/tunnel/start', { method: 'POST' });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setTunnelError(data.error ?? 'Could not launch tunnel.');
      } else {
        await onRefreshServerInfo();
      }
    } catch {
      setTunnelError('Failed to start tunnel.');
    } finally {
      setTunnelBusy(false);
    }
  }

  async function handleStopTunnel() {
    setTunnelBusy(true);
    try {
      await fetch('/api/tunnel/stop', { method: 'POST' });
      await onRefreshServerInfo();
    } finally {
      setTunnelBusy(false);
    }
  }

  return (
    <ModalDialog open={open} onClose={onClose} title="Invite Players to Your Room">
      <div className="field">
        <label htmlFor="invite-current-url">Active Invite Link</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            id="invite-current-url"
            className="input"
            readOnly
            value={tunnelInvite ?? currentOriginInvite}
          />
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => copy(tunnelInvite ?? currentOriginInvite, 'invite')}
          >
            {copiedText === 'invite' ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Copy size={16} aria-hidden="true" />
            )}
            {copiedText === 'invite' ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {serverInfo.isLocalHost && serverInfo.lanUrls.length > 0 ? (
        <div className="field">
          <label>
            <Laptop size={14} style={{ verticalAlign: 'middle', marginInlineEnd: '0.35rem' }} aria-hidden="true" />
            Same Wi-Fi / LAN Links
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {serverInfo.lanUrls.map((lan) => {
              const full = `${lan}/?room=${roomCode}`;
              return (
                <div key={lan} style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    aria-label={`LAN invite URL ${full}`}
                    className="input"
                    readOnly
                    value={full}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => copy(full, lan)}
                  >
                    {copiedText === lan ? (
                      <Check size={16} aria-hidden="true" />
                    ) : (
                      <Copy size={16} aria-hidden="true" />
                    )}
                    Copy
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {serverInfo.isLocalHost ? (
        <div
          style={{
            padding: '0.9rem',
            borderRadius: '12px',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-page)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
              <Globe size={16} aria-hidden="true" />
              Remote Friends (Free Public Tunnel)
            </strong>
            {serverInfo.tunnelUrl ? (
              <span className="badge badge--success">Live</span>
            ) : null}
          </div>

          {serverInfo.tunnelUrl ? (
            <>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  aria-label="Public tunnel invite URL"
                  className="input"
                  readOnly
                  value={`${serverInfo.tunnelUrl}/?room=${roomCode}`}
                />
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() =>
                    copy(`${serverInfo.tunnelUrl}/?room=${roomCode}`, 'tunnel')
                  }
                >
                  {copiedText === 'tunnel' ? (
                    <Check size={16} aria-hidden="true" />
                  ) : (
                    <Copy size={16} aria-hidden="true" />
                  )}
                  Copy
                </button>
              </div>
              <button
                type="button"
                className="btn btn--danger"
                onClick={handleStopTunnel}
                disabled={tunnelBusy}
              >
                <Square size={15} aria-hidden="true" />
                Stop Public Tunnel
              </button>
            </>
          ) : serverInfo.tunnelAvailable ? (
            <>
              <p className="field-hint">
                Detected <code>{serverInfo.tunnelProvider}</code> on your machine.
                Launch a free temporary URL so friends anywhere can join with one click:
              </p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleStartTunnel}
                disabled={tunnelBusy}
              >
                <Play size={16} aria-hidden="true" />
                {tunnelBusy
                  ? 'Starting Tunnel…'
                  : `Start Free ${serverInfo.tunnelProvider} Tunnel`}
              </button>
            </>
          ) : (
            <>
              <p className="field-hint">
                To invite friends outside your Wi-Fi without renting a server, run a free
                quick tunnel in another terminal (e.g. Cloudflare Tunnel):
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <code
                  style={{
                    flex: 1,
                    padding: '0.55rem 0.7rem',
                    borderRadius: '8px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '0.8rem',
                    overflowX: 'auto',
                  }}
                >
                  <Terminal size={13} style={{ verticalAlign: 'middle', marginInlineEnd: '0.35rem' }} aria-hidden="true" />
                  cloudflared tunnel --url http://localhost:{serverInfo.port}
                </code>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    copy(
                      `cloudflared tunnel --url http://localhost:${serverInfo.port}`,
                      'cmd',
                    )
                  }
                >
                  {copiedText === 'cmd' ? (
                    <Check size={15} aria-hidden="true" />
                  ) : (
                    <Copy size={15} aria-hidden="true" />
                  )}
                </button>
              </div>
            </>
          )}

          {tunnelError ? (
            <div className="alert alert--error" role="alert">
              <span>{tunnelError}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </ModalDialog>
  );
}
