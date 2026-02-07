# 🛡️ Universal Cloudflare Solver API 🚀

An automated API service that uses **Puppeteer** and **Real Chrome** to bypass Cloudflare Turnstile/Challenge pages and retrieve session cookies.

**Features:**
- 🌍 **Universal**: Works on any website protected by Cloudflare.
- 🕵️ **Stealth Mode**: Uses `puppeteer-extra-plugin-stealth` and a real Chrome browser instance.
- 🍪 **Session Persistence**: Maintains a user profile (`~/.config/chrome-bot-login`) to build trust and bypass checks faster.
- ⚡ **API Ready**: Exposes a simple REST endpoint (`POST /solve`) for easy integration.

---

## ⚙️ Installation

1.  **Clone/Download** this repository.
2.  **Install Dependencies**:
    ```bash
    npm install
    # OR
    npm install express puppeteer-extra puppeteer-extra-plugin-stealth axios
    ```
3.  **Ensure Chrome is Installed**:
    - This bot relies on `google-chrome-stable` being installed on your system.
4.  **Install Xvfb** (for headless servers):
    ```bash
    sudo apt-get install xvfb
    ```

---

## 🖥️ Running on Headless Server (VPS)

### Option 1: Using `xvfb-run` (Manual)
Native Chrome Headless is detected by Cloudflare. Use **Xvfb** to trick it:
```bash
xvfb-run --auto-servernum --server-args="-screen 0 1280x1024x24" node index.js
```

### Option 2: Using PM2 (Recommended)
To keep the bot running in the background and auto-restart:

1. **Install PM2**:
   ```bash
   npm install -g pm2
   ```
2. **Make the startup script executable**:
   ```bash
   chmod +x start.sh
   # Content of start.sh:
   # #!/bin/bash
   # xvfb-run --auto-servernum --server-args="-screen 0 1280x1024x24" node index.js
   ```
3. **Start with PM2**:
   ```bash
   pm2 start start.sh --name "turnstile-solver"
   ```
4. **Save list**:
   ```bash
   pm2 save
   pm2 startup
   ```

---

## 🚀 Usage

### 1. Start the Server
Run the API server on port 8000:
```bash
node index.js
```
*The server will keep Chrome running in the background for faster subsequent requests.*

### 2. Request a Bypass
Send a `POST` request to the `/solve` endpoint with the target URL.

**Example using cURL:**
```bash
curl -X POST http://localhost:8000/solve \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.ivasms.com/login"}'
```

**Request Body:**
```json
{
  "url": "https://target-website.com"
}
```

### 3. Response
The API returns the session cookies and User-Agent string.

**Success Response:**
```json
{
  "status": "success",
  "data": {
    "success": true,
    "message": "Cloudflare check finished",
    "cookies": [
      {
        "name": "cf_clearance",
        "value": "...",
        "domain": ".target-website.com",
        ...
      }
    ],
    "userAgent": "Mozilla/5.0 ...",
    "currentUrl": "https://target-website.com/dashboard"
  }
}
```

---

## ⚠️ Notes
- **Port**: 8000
- **Debug Port**: 9222
- **Chrome Profile**: Stored in `~/.config/chrome-bot-login`. Do not delete this folder if you want to maintain "trusted" status with Cloudflare.

---
*Powered by Puppeteer & Express*
