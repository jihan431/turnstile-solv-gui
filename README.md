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

---

## 🖥️ Running on Headless Server (VPS)

Native Chrome Headless (`--headless=new`) is **often detected** by Cloudflare.
To run this on a properly headless server (e.g., Ubuntu/Debian VPS) without a monitor, use **Xvfb** (Virtual Framebuffer):

1. **Install Xvfb**:
   ```bash
   sudo apt-get install xvfb
   ```
2. **Run with Xvfb**:
   ```bash
   xvfb-run --auto-servernum --server-args="-screen 0 1280x1024x24" node index.js
   ```
This tricks Cloudflare into thinking it's running in a real desktop environment, which is crucial for passing the challenge.

---

## 🚀 Usage

### 1. Start the Server
Run the API server on port 8000:
```bash
node index.js
# OR with Xvfb (recommended for servers):
xvfb-run node index.js
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
