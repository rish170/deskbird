# Deploying the Deskbird Server to Render

This guide explains how to deploy the Deskbird Socket.IO relay server to [Render](https://render.com) using the included `render.yaml` Blueprint or manual web service creation.

---

## 1. Quick Deploy with Render Blueprint (`render.yaml`)

The repository includes a root `render.yaml` specification configured for Render's Infrastructure-as-Code Blueprint:

1. Push your repository to GitHub:
   ```powershell
   git push origin main
   ```
2. Log in to [dashboard.render.com](https://dashboard.render.com).
3. In the top-right corner, click **New +** and select **Blueprint**.
4. Connect your `https://github.com/rish170/deskbird` repository.
5. Render will automatically detect `render.yaml` and configure:
   - **Service Name**: `deskbird-server`
   - **Root Directory**: `server`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node src/index.js`
   - **Plan**: `Free`
   - **Health Check Path**: `/healthz`
6. Click **Apply Blueprint**.
7. Once the deploy succeeds, copy your service URL (e.g., `https://deskbird-server.onrender.com`).

---

## 2. Environment Variables Configuration

If configuring manually or adjusting settings in the Render Dashboard (**Environment** tab):

| Key | Recommended Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Enables production security and disables local test secrets. |
| `ALLOWED_ORIGINS` | `https://deskbird.vercel.app,http://localhost:5173` | Comma-separated list of origins allowed to connect via CORS and Socket.IO. |
| `MAX_QUEUE` | `20` | Max unread messages stored in memory per offline bird. |
| `MESSAGE_TTL_MS` | `86400000` | 24-hour expiration for unread queued messages. |
| `HEARTBEAT_EXPECTED_MS` | `240000` | 4-minute heartbeat window from bird clients. |

---

## 3. Render Free Tier Behavior & Architecture

Render's free web services provide full WebSocket support but have specific lifecycle characteristics:

1. **Inactivity Sleep**:
   - Free services spin down after **15 minutes** without an incoming HTTP request or active incoming WebSocket message.
   - The cold start from sleep takes between **30 to 60 seconds**.
2. **How Deskbird Handles This**:
   - **Web App Pre-Warm**: When User 2 opens the web app link, the page immediately calls `fetch('https://deskbird-server.onrender.com/healthz')` while displaying a retro `"waking the server..."` status indicator.
   - **Desktop Bird Heartbeat**: The desktop bird sends a `bird:ping` keepalive every 4 minutes while connected, preventing the free service from spinning down while an active bird is open.
   - **Auto-Reconnect**: If Render drops the connection during infrastructure cycling, both the bird and the web client reconnect automatically with exponential backoff and jitter.

---

## 4. Monitoring & Viewing Logs

1. In the Render Dashboard, click on your `deskbird-server` service.
2. Select the **Logs** tab.
3. You will see structured lifecycle logs:
   ```
   [Deskbird Server] Listening on port 10000
   [Deskbird] Bird joined room: ABCD2345 (delivered 0 queued messages)
   [Deskbird] Bird disconnected from room: ABCD2345
   ```
4. Note that message text is never logged to disk or console to protect user privacy.

