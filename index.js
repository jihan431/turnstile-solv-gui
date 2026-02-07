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
        // Using angle+swiftshader with unsafe flag to force CPU rendering properly
        const chromeCmd = `google-chrome-stable --remote-debugging-port=${DEBUG_PORT} --user-data-dir="${USER_DATA_DIR}" --no-first-run --disable-blink-features=AutomationControlled --no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --ignore-gpu-blocklist --enable-webgl --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=1920,1080 --window-position=0,0`;
        
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
        
        // --- SAMARKAN IDENTITAS ---
        // Force pakai User-Agent Windows 10 Chrome terbaru biar tidak dikira Linux Server
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        console.log(`🔗 Mengakses ${targetUrl}...`);
        try {
            await page.goto(targetUrl, { 
                waitUntil: 'domcontentloaded', 
                timeout: 60000 
            });
        } catch (e) {
            console.log("⚠️ Mengakses page timeout, tapi lanjut (page mungkin sudah load)...");
        }

        // Helper untuk memvisualisasikan klik (Merah = Klik)
        await page.evaluate(() => {
            const box = document.createElement('div');
            box.id = 'puppeteer-mouse-pointer';
            box.style.position = 'absolute';
            box.style.width = '20px';
            box.style.height = '20px';
            box.style.background = 'red';
            box.style.borderRadius = '50%';
            box.style.zIndex = '100000';
            box.style.pointerEvents = 'none';
            document.body.appendChild(box);
        });

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
                                        // STRATEGI BARU: Klik di KIRI (Posisi Checkbox), bukan di tengah
                                        // Widget biasanya lebar, checkbox ada di kiri (sekitar 30px dari kiri)
                                        const x = box.x + 30; // 30px dari kiri iframe
                                        const y = box.y + box.height / 2;
                                        
                                        console.log(`📍 Koordinat Klik Sasaran: ${x}, ${y}`);

                                        // VISUALISASI: Pindahkan titik merah ke lokasi klik
                                        await page.evaluate((x, y) => {
                                            const el = document.getElementById('puppeteer-mouse-pointer');
                                            if(el) {
                                                el.style.left = (x - 10) + 'px';
                                                el.style.top = (y - 10) + 'px';
                                            }
                                        }, x, y);

                                        // Screenshot SEBELUM Klik (untuk memastikan posisi)
                                        await page.screenshot({ path: path.join(__dirname, 'debug_cf_screenshot.png') });

                                        // AKSI KLIK
                                        await page.mouse.move(x, y, { steps: 5 });
                                        await new Promise(r => setTimeout(r, 100));
                                        await page.mouse.down();
                                        await new Promise(r => setTimeout(r, 150));
                                        await page.mouse.up();

                                        console.log("🖱️  KLIK Checkbox (Left Side)!");
                                        await new Promise(r => setTimeout(r, 3000));
                                        break;
                                    }
                                }
                            }
                        } catch (clickErr) {
                            console.log(`❌ Gagal klik: ${clickErr.message}`);
                        }
                    }

                    // --- KEYBOARD FALLBACK ---
                    try {
                         // Focus ke page dulu
                         await page.click('body').catch(() => {});
                         for(let i=0; i<2; i++) {
                             await page.keyboard.press('Tab');
                             await new Promise(r => setTimeout(r, 200));
                         }
                         await page.keyboard.press('Space');
                    } catch(e) {}
                    // -------------------------

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
             await page.screenshot({ path: path.join(__dirname, 'timeout_screenshot.png') });
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

// Endpoint untuk melihat screenshot debug terakhir (berguna di VPS)
app.get('/screenshot', (req, res) => {
    const p1 = path.resolve(__dirname, 'debug_cf_screenshot.png');
    if (fs.existsSync(p1)) return res.sendFile(p1);
    
    const p2 = path.resolve(__dirname, 'timeout_screenshot.png');
    if (fs.existsSync(p2)) return res.sendFile(p2);
    
    res.status(404).send('No screenshot available yet.');
});

app.get('/', (req, res) => {
    res.send('Universal Cloudflare Solver API via Puppeteer/Chrome is running.');
});

app.listen(PORT, () => {
    console.log(`🚀 Server Solver berjalan di http://localhost:${PORT}`);
    console.log(`👉 Gunakan endpoint [POST] /solve`);
    console.log(`📷 Endpoint Screenshot: http://localhost:${PORT}/screenshot`);
});
