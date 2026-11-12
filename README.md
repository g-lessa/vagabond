# Vagabond

A free, self-hosted multiplayer GeoGuessr alternative powered by **MapillaryJS**, **OpenStreetMap / Carto**, **Leaflet**, and **Socket.io**.

No subscriptions, no Google Maps billing, and no rented server—one player runs Vagabond on their machine and friends join via browser.

## Features

- **Real-time Multiplayer Lobbies** with room codes, invite links, persistent reconnects, and kick controls
- **Editable Match Rules**:
  - Customizable number of rounds (`1–20`)
  - Customizable round timer (`15s–600s`, or `0` for Unlimited)
  - Optional GeoGuessr timer pressure (shortens remaining time, e.g. to `15s`, after the first player guesses)
  - **360° Panoramas Only** by default (with toggle to allow flat/dashcam photos in rarer regions)
  - **Allow Street Movement** toggle (Moving vs. No-Move)
- **Maps & Regions**: World (continent-balanced), all 6 continents, Nordic Countries, 170+ individual countries (offline polygon matching via `world-atlas`), and a **Custom Area** map box picker
- **GeoGuessr-Accurate Scoring**: Exponential `0–5,000` curve scaled to the selected map's diagonal, draft-pin auto-submission on timer expiry, live compass, return-to-start (`R`), `Space` to guess, and interactive results map + podium breakdown

## Prerequisites

1. **Node.js 20+** (already installed at `~/.local/node` if set up during creation)
2. **Free Mapillary Client Access Token**:
   - Visit [Mapillary Developer Dashboard](https://www.mapillary.com/dashboard/developers)
   - Register an app (Read access) and copy the **Client Token** (`MLY|...`)
   - Only the **host** needs a token; friends joining via link need no account.

## Running as Host

### Quick Start
```bash
./start.sh
```
Or manually:
```bash
npm install
npm run build
npm start
```
Then open `http://localhost:3000`, paste your Mapillary Client Token in the setup dialog (or set `MAPILLARY_ACCESS_TOKEN` in `.env`), and click **Create Multiplayer Room**.

### Inviting Remote Friends (Without Renting a Server)
- **Same Wi-Fi / LAN / Tailscale**: Copy the LAN invite link shown in the lobby's **LAN / Tunnel** modal.
- **Over the Internet (Free Quick Tunnel)**:
  Install `cloudflared` (`brew install cloudflared`) and either click **Start Free cloudflared Tunnel** right inside the lobby's **LAN / Tunnel** modal, or run in another terminal:
  ```bash
  cloudflared tunnel --url http://localhost:3000
  ```
  Share the generated `https://*.trycloudflare.com/?room=CODE` link with friends.

## Development & Tests

```bash
npm run dev        # Runs API/WebSocket server (3001) + Vite proxy (3000)
npm run typecheck  # TypeScript check across client, server, and shared
npm test           # Vitest unit & room state machine tests
npm run build      # Builds both Vite client and TypeScript server
```
