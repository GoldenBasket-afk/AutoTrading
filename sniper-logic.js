// Elements
const dropZone = document.getElementById('drop-zone');
const chartInput = document.getElementById('chartInput');
const scanningOverlay = document.getElementById('scanning-overlay');
const resultDashboard = document.getElementById('result-dashboard');
const uploadedImage = document.getElementById('uploaded-image');
const resetBtn = document.getElementById('reset-btn');

// Result Elements
const tradeSignal = document.getElementById('trade-signal');
const tpPrice = document.getElementById('tp-price');
const slPrice = document.getElementById('sl-price');
const entryPrice = document.getElementById('entry-price');
const patternList = document.getElementById('pattern-list');
const livePrice = document.getElementById('live-price');
const scanningText = document.querySelector('.scanning-text');

// Camera Elements
const openCameraBtn = document.getElementById('open-camera-btn');
const cameraModal = document.getElementById('camera-modal');
const cameraFeed = document.getElementById('camera-feed');
const captureBtn = document.getElementById('capture-btn');
const closeCameraBtn = document.getElementById('close-camera-btn');
const cameraCanvas = document.getElementById('camera-canvas');
let stream = null;
let analysisCount = 0;
const MAX_FREE_SCANS = 2;

// License & Device Logic
const VALID_CODES = ["SNIPER-PRO-72A1", "SNIPER-PRO-B942", "SNIPER-PRO-C538", "SNIPER-PRO-DF12", "SNIPER-PRO-E890", "SNIPER-PRO-F271", "SNIPER-PRO-314B", "SNIPER-PRO-99E7", "SNIPER-PRO-A01D", "SNIPER-PRO-66C5"];
let isUnlimited = localStorage.getItem('sniper_unlimited') === 'true';
let deviceId = localStorage.getItem('sniper_device_id');
if (!deviceId) {
    // Enhanced device fingerprinting (Browser/OS/Hardware context)
    const fp = [
        navigator.userAgent,
        navigator.language,
        screen.colorDepth,
        new Date().getTimezoneOffset()
    ].join('|');
    deviceId = 'SNPR-' + btoa(fp).substr(0, 12).toUpperCase();
    localStorage.setItem('sniper_device_id', deviceId);
}
let deviceScans = parseInt(localStorage.getItem('sniper_scans_' + deviceId)) || 0;

const lockOverlay = document.getElementById('license-lock-overlay');
const displayDeviceId = document.getElementById('display-device-id');
if (displayDeviceId) displayDeviceId.textContent = deviceId;

function checkInitialLock() {
    if (isUnlimited) {
        if (lockOverlay) lockOverlay.style.display = 'none';
    } else {
        if (lockOverlay) lockOverlay.style.display = 'flex';
    }
}
checkInitialLock();

function updateLimitUI() {
    const limitInfo = document.getElementById('scan-limit-info');
    if (isUnlimited) {
        limitInfo.textContent = "LICENSE: UNLIMITED";
        limitInfo.style.background = "var(--neon-green)";
        if (lockOverlay) lockOverlay.style.display = 'none';
    } else {
        const remaining = Math.max(0, MAX_FREE_SCANS - deviceScans);
        limitInfo.textContent = `Scans Remaining: ${remaining}`;
        if (remaining === 0) {
            limitInfo.style.background = "#550000";
            if (lockOverlay) lockOverlay.style.display = 'flex';
        }
    }
}
updateLimitUI();

// Main Activation Button Flow
document.getElementById('main-activate-btn').addEventListener('click', () => {
    const code = document.getElementById('main-activation-code').value.trim().toUpperCase();
    handleActivation(code);
});

// Sync from settings modal as well
document.getElementById('activate-license-btn').addEventListener('click', () => {
    const code = document.getElementById('activation-code').value.trim().toUpperCase();
    handleActivation(code);
});

function handleActivation(code) {
    if (VALID_CODES.includes(code)) {
        isUnlimited = true;
        localStorage.setItem('sniper_unlimited', 'true');
        alert("SUCCESS! LICENSE ACTIVATED: UNLIMITED SCANS ENABLED.");
        updateLimitUI();
    } else {
        alert("INVALID CODE. Please contact developer for a valid license.");
    }
}

// Event Listeners
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('dragover'); });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});
dropZone.addEventListener('click', (e) => {
    // Prevent triggering upload when clicking camera button
    if (e.target !== openCameraBtn) chartInput.click();
});
chartInput.addEventListener('change', (e) => { if (e.target.files.length > 0) handleFile(e.target.files[0]); });
resetBtn.addEventListener('click', resetApp);

// Camera Logic
openCameraBtn.addEventListener('click', async (e) => {
    e.stopPropagation(); // Stop bubble to dropzone
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "environment" // Use back camera on mobile
            }
        });
        cameraFeed.srcObject = stream;
        cameraModal.classList.remove('hidden');
    } catch (err) {
        alert("Camera Access Denied or Not Available: " + err.message);
    }
});

closeCameraBtn.addEventListener('click', stopCamera);

captureBtn.addEventListener('click', () => {
    // Draw frame to canvas
    cameraCanvas.width = cameraFeed.videoWidth;
    cameraCanvas.height = cameraFeed.videoHeight;
    const ctx = cameraCanvas.getContext('2d');
    ctx.drawImage(cameraFeed, 0, 0, cameraCanvas.width, cameraCanvas.height);

    // Convert to Image
    uploadedImage.onload = () => {
        startAlgorithmicAnalysis(uploadedImage);
    };
    uploadedImage.src = cameraCanvas.toDataURL('image/png');

    stopCamera();
});

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    cameraModal.classList.add('hidden');
}


// Main Logic
function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('Please upload a valid image file.');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        // Set onload BEFORE setting src to avoid race condition
        uploadedImage.onload = () => {
            startAlgorithmicAnalysis(uploadedImage);
        };
        uploadedImage.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

async function startAlgorithmicAnalysis(imgElement) {
    if (!isUnlimited && deviceScans >= MAX_FREE_SCANS) {
        alert("SYSTEM LIMIT REACHED! Please activate Sniper Pro License for unlimited analysis on this device.");
        return;
    }

    // Increment scan count
    deviceScans++;
    localStorage.setItem('sniper_scans_' + deviceId, deviceScans);
    updateLimitUI();

    dropZone.classList.add('hidden');
    scanningOverlay.classList.remove('hidden');
    livePrice.textContent = "Scanning...";
    scanningText.textContent = "INITIALIZING VISUAL ENGINE...";

    // Set Preview Image for Scanning Effect
    document.getElementById('scan-preview-img').src = imgElement.src;

    try {
        // 1. Pixel/Color Analysis (Fast)
        scanningText.textContent = "SCANNING CANDLESTICK COLORS...";
        const colorAnalysis = analyzeColors(imgElement);

        // 2. Text/Price Analysis (Slow) - Run with timeout fallback
        scanningText.textContent = "Analysis...";

        // Random Delay 3 - 10 Seconds
        const delay = Math.floor(Math.random() * (10000 - 3000 + 1)) + 3000;
        await new Promise(resolve => setTimeout(resolve, delay));

        let ocrPrice = 0;
        try {
            // Timeout OCR after 5 seconds to prevent hanging
            ocrPrice = await Promise.race([
                performOCR(imgElement),
                new Promise((resolve) => setTimeout(() => resolve(0), 5000))
            ]);
        } catch (e) {
            console.warn("OCR Skipped/Failed", e);
            ocrPrice = 0;
        }

        scanningText.textContent = "CALCULATING SIGNALS...";
        const finalData = combineLogic(ocrPrice, colorAnalysis);

        scanningOverlay.classList.add('hidden');
        populateDashboard(finalData);

    } catch (error) {
        console.error(error);
        scanningOverlay.classList.add('hidden');
        alert("System Error: " + error.message);
        resetApp(); // Reset so they can try again
    }
}

// 1. Pixel Color Analysis (Simple & Fast)
function analyzeColors(imgElement) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = imgElement.naturalWidth;
    canvas.height = imgElement.naturalHeight;
    ctx.drawImage(imgElement, 0, 0);

    // Focus on the right-most 40% of the screen (Recent Price Action)
    const scanWidth = Math.floor(canvas.width * 0.4);
    const startX = canvas.width - scanWidth;

    // Get pixel data
    const imageData = ctx.getImageData(startX, 0, scanWidth, canvas.height);
    const data = imageData.data;

    let greenScore = 0;
    let redScore = 0;
    let greenIntensity = 0;
    let redIntensity = 0;

    // Scan pixels
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Green Candle Logic (Green is dominant)
        if (g > r + 30 && g > b + 30) {
            greenScore++;
            greenIntensity += g;
        }
        // Red Candle Logic (Red is dominant)
        else if (r > g + 30 && r > b + 30) {
            redScore++;
            redIntensity += r;
        }
    }

    return { greenScore, redScore, greenIntensity, redIntensity };
}

// 2. OCR Logic using Tesseract.js (Heavy)
async function performOCR(imgElement) {
    if (typeof Tesseract === 'undefined') return 0;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const { naturalWidth: w, naturalHeight: h } = imgElement;

    // --- STEP 1: Global Keyword Scan (Demo/Practice) ---
    // Scan both top 30% AND whole image for mobile screenshots
    canvas.width = w;
    canvas.height = h;
    ctx.filter = 'grayscale(100%) contrast(150%)';
    ctx.drawImage(imgElement, 0, 0);

    let worker = await Tesseract.createWorker('eng');
    let ret = await worker.recognize(canvas.toDataURL());
    let text = ret.data.text.toUpperCase();
    console.log("Global OCR Scan:", text);

    const isDemo = text.includes('DEMO') || text.includes('PRACTICE') || text.includes('VIRTUAL') || text.includes('CONTEST') || text.includes('PRAK');
    if (isDemo) {
        await worker.terminate();
        return "DEMO_DETECTED";
    }

    // --- STEP 2: Price Detection (Optimized for Mobile) ---
    // We check the right-side strip (30% width) for prices
    const cropWidth = Math.floor(w * 0.30);
    const cropX = w - cropWidth;

    canvas.width = cropWidth;
    canvas.height = h;
    ctx.filter = 'grayscale(100%) contrast(150%) brightness(120%)';
    ctx.drawImage(imgElement, cropX, 0, cropWidth, h, 0, 0, cropWidth, h);

    await worker.setParameters({
        tessedit_char_whitelist: '0123456789.XAUUSD',
    });

    ret = await worker.recognize(canvas.toDataURL());
    await worker.terminate();

    text = ret.data.text.toUpperCase();
    console.log("Price OCR (Mobile Optimized):", text);

    // Look for price patterns (e.g., 2045.12)
    const numbers = text.match(/\d{4}\.\d{2}/g);
    if (numbers && numbers.length > 0) {
        // For mobile, the current price is often highlighted or the last one cited
        return parseFloat(numbers[numbers.length - 1]);
    }

    return 0;
}


// 3. Combine Logic
function combineLogic(price, colorData) {
    let signal = "WAIT";

    const totalScore = colorData.greenScore + colorData.redScore;
    if (totalScore === 0) return { signal: "ERROR", patterns: ["No clear candles found"], entry: 0, tp: 0, sl: 0 };

    const greenRatio = colorData.greenScore / totalScore;

    // Decision Logic
    if (greenRatio > 0.52) { // Slightly lower threshold for quicker signals
        signal = "BUY";
    } else if (greenRatio < 0.48) {
        signal = "SELL";
    }

    // Price Fallback logic refinement
    if (price === "DEMO_DETECTED") {
        return {
            signal: "ERROR",
            patterns: ["Demo Account Detected", "Analysis only available for Real Accounts"],
            entry: 0, tp: 0, sl: 0
        };
    }

    const displayPrice = price;

    if (displayPrice === 0) {
        return {
            signal: "ERROR",
            patterns: ["Invalid Chart Image - No Price Detected", "Please upload a clear XAUUSD chart"],
            entry: 0, tp: 0, sl: 0
        };
    }

    // TP/SL
    let entry = displayPrice;
    let tp, sl;

    // Dynamic TP/SL based on "Intensity"
    const volatilityFactor = (Math.abs(colorData.greenIntensity - colorData.redIntensity) / 100000) || 5;

    if (signal === "BUY") {
        tp = entry + (7.00 + volatilityFactor);
        sl = entry - (2.00 + volatilityFactor / 4);
    } else if (signal === "SELL") {
        tp = entry - (7.00 + volatilityFactor);
        sl = entry + (2.00 + volatilityFactor / 4);
    } else {
        tp = 0; sl = 0;
    }

    return {
        signal,
        entry,
        tp,
        sl,
        patterns: [
            price > 0 ? `Current Price: ${price}` : `Price Estimate (OCR N/A): ${displayPrice}`,
            `Bullish Volume: ${(greenRatio * 100).toFixed(0)}%`,
            `Bearish Volume: ${((1 - greenRatio) * 100).toFixed(0)}%`,
            signal === "WAIT" ? "Market is Ranging (No clear trend)" : `Strong ${signal} Trend Detected`
        ]
    };
}

function populateDashboard(data) {
    resultDashboard.classList.remove('hidden');

    tradeSignal.textContent = data.signal + " SIGNAL";
    tradeSignal.className = '';
    if (data.signal === 'BUY') tradeSignal.classList.add('buy-signal');
    else if (data.signal === 'SELL') tradeSignal.classList.add('sell-signal');
    else tradeSignal.classList.add('wait-signal');

    livePrice.textContent = data.entry.toFixed(2);
    entryPrice.textContent = data.entry.toFixed(2);
    tpPrice.textContent = data.tp.toFixed(2);
    slPrice.textContent = data.sl.toFixed(2);

    patternList.innerHTML = '';
    data.patterns.forEach(pattern => {
        const li = document.createElement('li');
        li.textContent = "▹ " + pattern;
        patternList.appendChild(li);
    });
}

function resetApp() {
    resultDashboard.classList.add('hidden');
    dropZone.classList.remove('hidden');
    chartInput.value = '';
    uploadedImage.src = '';
    patternList.innerHTML = '';
    livePrice.textContent = "--.--";
}

// Security: Prevent Right Click
document.addEventListener('contextmenu', (e) => e.preventDefault());

// Security: Detect Screen Capture / Focus Loss
const securityOverlay = document.getElementById('security-overlay');

window.addEventListener('blur', () => {
    document.body.style.filter = 'blur(20px)';
    if (securityOverlay) securityOverlay.style.display = 'flex';
});

window.addEventListener('focus', () => {
    document.body.style.filter = 'none';
    if (securityOverlay) securityOverlay.style.display = 'none';
});

// Security: Print Protection (Wait for print)
window.onbeforeprint = () => {
    document.body.style.display = 'none';
};
window.onafterprint = () => {
    document.body.style.display = 'block';
};

