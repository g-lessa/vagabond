import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import type { Request } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const CONFIG_PATH = path.resolve(process.cwd(), '.vagabond-config.json');
const ENV_PATH = path.resolve(process.cwd(), '.env');

interface PersistedConfig {
  mapillaryAccessToken?: string;
}

function readPersistedConfig(): PersistedConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as PersistedConfig;
  } catch {
    return {};
  }
}

function readEnvToken(): string | null {
  const fromProc = process.env.MAPILLARY_ACCESS_TOKEN?.trim();
  if (fromProc) return fromProc;
  try {
    if (!fs.existsSync(ENV_PATH)) return null;
    const parsed = dotenv.parse(fs.readFileSync(ENV_PATH, 'utf8'));
    const fromFile = parsed.MAPILLARY_ACCESS_TOKEN?.trim();
    return fromFile || null;
  } catch {
    return null;
  }
}

function writePersistedConfig(config: PersistedConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', {
    mode: 0o600,
  });
}

let cachedToken: string | null =
  readEnvToken() ||
  readPersistedConfig().mapillaryAccessToken?.trim() ||
  null;

export function getMapillaryToken(): string | null {
  if (cachedToken && cachedToken.length > 0) return cachedToken;
  const fresh =
    readEnvToken() ||
    readPersistedConfig().mapillaryAccessToken?.trim() ||
    null;
  if (fresh) cachedToken = fresh;
  return fresh;
}

export function setMapillaryToken(token: string): void {
  const trimmed = token.trim();
  cachedToken = trimmed.length > 0 ? trimmed : null;
  const existing = readPersistedConfig();
  if (cachedToken) {
    existing.mapillaryAccessToken = cachedToken;
  } else {
    delete existing.mapillaryAccessToken;
  }
  writePersistedConfig(existing);
}

export async function validateMapillaryToken(
  token: string,
): Promise<{ valid: boolean; error?: string }> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { valid: false, error: 'Token cannot be empty.' };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      'https://graph.mapillary.com/images?fields=id&bbox=-0.128,51.506,-0.125,51.508&limit=1',
      {
        headers: { Authorization: `OAuth ${trimmed}` },
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);
    if (res.ok) {
      return { valid: true };
    }
    const text = await res.text();
    let msg = `Mapillary rejected token (HTTP ${res.status}).`;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      if (parsed.error?.message) {
        msg = parsed.error.message;
      }
    } catch {
      // ignore non-JSON
    }
    return { valid: false, error: msg };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Network error validating token.',
    };
  }
}

export function getLanUrls(port: number): string[] {
  const interfaces = os.networkInterfaces();
  const urls: string[] = [];
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const info of entries) {
      if (info.family === 'IPv4' && !info.internal) {
        urls.push(`http://${info.address}:${port}`);
      }
    }
  }
  return Array.from(new Set(urls));
}

function getOwnInterfaceAddresses(): Set<string> {
  const own = new Set<string>(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const info of entries) {
      own.add(info.address);
      if (info.family === 'IPv4') {
        own.add(`::ffff:${info.address}`);
      }
    }
  }
  return own;
}

export function isLoopbackRequest(req: Request): boolean {
  // Never trust forwarded/tunnel traffic as local host
  if (
    req.headers['cf-connecting-ip'] ||
    req.headers['cf-ray'] ||
    req.headers['x-forwarded-for'] ||
    req.headers['forwarded']
  ) {
    return false;
  }
  const addr = req.socket.remoteAddress ?? '';
  return getOwnInterfaceAddresses().has(addr);
}

function findBinary(name: string): boolean {
  const customPaths = [
    path.join(os.homedir(), '.local', 'bin', name),
    path.join(os.homedir(), '.local', 'node', 'bin', name),
    path.join('/opt', 'homebrew', 'bin', name),
    path.join('/usr', 'local', 'bin', name),
  ];
  for (const p of customPaths) {
    if (fs.existsSync(p)) return true;
  }
  try {
    execFileSync('which', [name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

class TunnelManager {
  private proc: ChildProcess | null = null;
  private activeUrl: string | null = null;
  private provider: 'cloudflared' | 'ngrok' | null = null;

  detectAvailableProvider(): 'cloudflared' | 'ngrok' | null {
    if (findBinary('cloudflared')) return 'cloudflared';
    if (findBinary('ngrok')) return 'ngrok';
    return null;
  }

  getUrl(): string | null {
    return this.activeUrl;
  }

  getProvider(): 'cloudflared' | 'ngrok' | null {
    return this.provider ?? this.detectAvailableProvider();
  }

  async start(port: number): Promise<{ url: string; provider: 'cloudflared' | 'ngrok' }> {
    if (this.proc && this.activeUrl && this.provider) {
      return { url: this.activeUrl, provider: this.provider };
    }
    this.stop();

    const available = this.detectAvailableProvider();
    if (!available) {
      throw new Error(
        'Neither cloudflared nor ngrok was found on PATH. Install cloudflared (`brew install cloudflared`) to launch a one-click tunnel.',
      );
    }

    if (available === 'cloudflared') {
      return await this.startCloudflared(port);
    }
    return await this.startNgrok(port);
  }

  private startCloudflared(
    port: number,
  ): Promise<{ url: string; provider: 'cloudflared' }> {
    return new Promise((resolve, reject) => {
      const bin = findBinary('cloudflared')
        ? (fs.existsSync(path.join(os.homedir(), '.local', 'bin', 'cloudflared'))
            ? path.join(os.homedir(), '.local', 'bin', 'cloudflared')
            : 'cloudflared')
        : 'cloudflared';
      const child = spawn(bin, ['tunnel', '--url', `http://127.0.0.1:${port}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.proc = child;
      this.provider = 'cloudflared';
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.stop();
          reject(new Error('Timed out waiting for Cloudflare Quick Tunnel URL.'));
        }
      }, 20_000);

      const onData = (chunk: Buffer) => {
        const text = chunk.toString();
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !settled) {
          settled = true;
          clearTimeout(timer);
          this.activeUrl = match[0];
          resolve({ url: match[0], provider: 'cloudflared' });
        }
      };

      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);
      child.on('exit', (code) => {
        this.proc = null;
        this.activeUrl = null;
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`cloudflared exited early (code ${code ?? 'unknown'}).`));
        }
      });
    });
  }

  private startNgrok(port: number): Promise<{ url: string; provider: 'ngrok' }> {
    return new Promise((resolve, reject) => {
      const child = spawn('ngrok', ['http', String(port), '--log=stdout'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.proc = child;
      this.provider = 'ngrok';
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.stop();
          reject(new Error('Timed out waiting for ngrok tunnel URL.'));
        }
      }, 15_000);

      const onData = (chunk: Buffer) => {
        const text = chunk.toString();
        const match = text.match(/url=(https:\/\/[^\s]+)/);
        if (match && !settled) {
          settled = true;
          clearTimeout(timer);
          this.activeUrl = match[1];
          resolve({ url: match[1], provider: 'ngrok' });
        }
      };

      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);
      child.on('exit', (code) => {
        this.proc = null;
        this.activeUrl = null;
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`ngrok exited early (code ${code ?? 'unknown'}).`));
        }
      });
    });
  }

  stop(): void {
    if (this.proc) {
      this.proc.kill('SIGTERM');
      this.proc = null;
    }
    this.activeUrl = null;
  }
}

export const tunnelManager = new TunnelManager();
