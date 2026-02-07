const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const axios = require('axios');
const express = require('express');

puppeteer.use(StealthPlugin());

// --- KONFIGURASI ---
// Revert to original profile for trust to help bypass CF
const USER_DATA_DIR = path.resolve(process.env.HOME, '.config/chrome-bot-login'); 
const DEBUG_PORT = 9222;
const PORT = 8000;

const app = express();
app.use(express.json()); 

let isProcessing = false;

// Function to start the solving process
async function startSolver(targetUrl) {
    console.log(`🚀 Memulai Solver untuk: ${targetUrl}`);
    
    let browser = null;
    let chromeProcess = null;

    try {
        // 1. Jalankan Chrome Manual
        if (!fs.existsSync(USER_DATA_DIR)) {
            fs.mkdirSync(USER_DATA_DIR, { recursive: true });
        }

        // Command line: Chrome with remote debugging
        // Flags optimized for Xvfb/VPS environments to pass WebGL checks
        // Using swiftshader is generally safer than angle on headless VPS without GPU
        const chromeCmd = `google-chrome-stable --remote-debugging-port=${DEBUG_PORT} --user-data-dir="${USER_DATA_DIR}" --no-first-run --disable-blink-features=AutomationControlled --no-sandbox --disable-setuid-sandbox --ignore-gpu-blocklist --enable-webgl --use-gl=swiftshader --window-size=1920,1080`;
        
        console.log(`🔥 Menjalankan Chrome: ${chromeCmd}`);
        // Kita execute dan biarkan jalan di background
        chromeProcess = exec(chromeCmd);

        // Log validasi jika chrome gagal start
        chromeProcess.stderr.on('data', (data) => console.error(`[Chrome Error]: ${data}`));
        chromeProcess.on('exit', (code) => console.log(`[Chrome Exit]: Process exited with code ${code}`));

        // Tunggu Chrome nyala
        await new Promise(r => setTimeout(r, 4000));

        // 2. Connect Puppeteer ke Chrome yang sudah jalan
        try {
            const response = await axios.get(`http://127.0.0.1:${DEBUG_PORT}/json/version`, { timeout: 5000 });
            const webSocketDebuggerUrl = response.data.webSocketDebuggerUrl;
            
            console.log(`🔌 Menyambungkan Puppeteer ke ${webSocketDebuggerUrl}...`);
            
            browser = await puppeteer.connect({
                browserWSEndpoint: webSocketDebuggerUrl,
                defaultViewport: null
            });
            
        } catch (e) {
            console.error("❌ Gagal connect ke Chrome. Pastikan 'google-chrome-stable' terinstall.");
            throw e;
        }

        const pages = await browser.pages();
        const page = pages[0] || await browser.newPage();
        
        console.log(`🔗 Mengakses ${targetUrl}...`);
        try {
            await page.goto(targetUrl, { 
                waitUntil: 'domcontentloaded', 
                timeout: 60000 
            });
        } catch (e) {
            console.log("⚠️ Mengakses page timeout, tapi lanjut (page mungkin sudah load)...");
        }

        // --- LOGIKA WAIT FOR CLOUDFLARE ---
        console.log("🛡️  Memeriksa Cloudflare Challenge...");
        
        const maxWaitSeconds = 60; 
        let clickAttempted = false;
        const startTime = Date.now();
        let cloudflarePassed = false;
        let cleanCycles = 0; // Count consecutive checks without CF to confirm it's really gone

        while (Date.now() - startTime < maxWaitSeconds * 1000) {
            try {
                const pageContent = await page.content();
                const isCloudflare = pageContent.includes('Just a moment') || 
                                     pageContent.includes('Checking your browser') ||
                                     pageContent.includes('cf-turnstile') ||
                                     pageContent.includes('challenge-running') ||
                                     pageContent.includes('Verifying you are human');

                if (isCloudflare) {
                    cleanCycles = 0; // Reset counter
                    console.log("⚠️  Cloudflare terdeteksi! Mencoba bypass...");
                    
                    if (!clickAttempted) {
                        clickAttempted = true;
                        try {
                            const selectors = [
                                'iframe[src*="challenges.cloudflare.com"]',
                                '#turnstile-wrapper iframe',
                                '.cf-turnstile iframe',
                                'iframe[title*="Widget"]'
                            ];

                            for (const selector of selectors) {
                                const frameElement = await page.$(selector);
                                if (frameElement) {
                                    console.log(`👉 Iframe ditemukan: ${selector}`);
                                    const box = await frameElement.boundingBox();
                                    if (box) {
                                        // Klik tengah iframe
                                        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                                        console.log("🖱️  KLIK!");
                                        await new Promise(r => setTimeout(r, 3000));
                                        break;
                                    }
                                }
                            }
                        } catch (clickErr) {
                            console.log(`❌ Gagal klik: ${clickErr.message}`);
                        }
                    }
                    await new Promise(r => setTimeout(r, 2000));
                    continue; 
                } else {
                    // Pastikan benar-benar sudah lewat (tunggu sebentar dan cek lagi)
                    cleanCycles++;
                    if (cleanCycles >= 3) { // Require 3 consecutive clean checks (~3-4 seconds)
                        console.log("✅ Cloudflare challenge passed (stabil).");
                        cloudflarePassed = true;
                        break;
                    }
                    await new Promise(r => setTimeout(r, 1000));
                }

            } catch (e) {
                 await new Promise(r => setTimeout(r, 1000));
            }
        }

        if (!cloudflarePassed) {
             console.log("⚠️  Peringatan: Waktu tunggu habis.");
        }

        // --- AMBIL HASIL (Cookies & UA) ---
        const cookies = await page.cookies();
        const userAgent = await page.browser().userAgent(); 

        // Filter valid cookies
        const finalCookies = cookies.map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            secure: c.secure,
            expirationDate: c.expires
        }));

        console.log(`✅ Selesai. Mendapatkan ${finalCookies.length} cookies.`);

        // Disconnect puppeteer but leave Chrome running
        if (browser) {
            try {
                await browser.disconnect();
            } catch(e) {}
        }
        
        return { 
            success: true, 
            message: "Cloudflare check finished",
            cookies: finalCookies,
            userAgent: userAgent,
            currentUrl: page.url() 
        };

    } catch (error) {
        console.error("Critical error in solver:", error);
        if (browser) {
            try { await browser.disconnect(); } catch (e) {}
        }
        throw error;
    }
}

// Route Handler: Universal Solver
app.post('/solve', async (req, res) => {
    // Check global lock
    if (isProcessing) {
        return res.status(409).json({ 
            status: 'error', 
            message: 'Solver is busy. Please wait.' 
        });
    }

    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ 
            status: 'error', 
            message: 'Missing "url" in request body.' 
        });
    }

    isProcessing = true;
    try {
        const result = await startSolver(url);
        res.status(200).json({ status: 'success', data: result });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    } finally {
        isProcessing = false;
    }
});

app.get('/', (req, res) => {
    res.send('Universal Cloudflare Solver API via Puppeteer/Chrome is running.');
});

app.listen(PORT, () => {
    console.log(`🚀 Server Solver berjalan di http://localhost:${PORT}`);
    console.log(`👉 Gunakan endpoint [POST] /solve`);
});
