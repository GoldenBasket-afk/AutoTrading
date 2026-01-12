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

// Event Listeners
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('dragover'); });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});
dropZone.addEventListener('click', () => { chartInput.click(); });
chartInput.addEventListener('change', (e) => { if (e.target.files.length > 0) handleFile(e.target.files[0]); });
resetBtn.addEventListener('click', resetApp);

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
        scanningText.textContent = "READING PRICE NUMBERS (OCR)...";
        let ocrPrice = 0;
        try {
            // Timeout OCR after 5 seconds
            ocrPrice = await Promise.race([
                performOCR(imgElement),
                new Promise((_, reject) => setTimeout(() => resolve(0), 5000))
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
    // Return mock price if Tesseract fails to load
    if (typeof Tesseract === 'undefined') return 0;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Crop: Right 15% (Price Scale)
    const cropWidth = Math.floor(imgElement.naturalWidth * 0.15);
    const cropHeight = imgElement.naturalHeight;
    const cropX = imgElement.naturalWidth - cropWidth;

    canvas.width = cropWidth;
    canvas.height = cropHeight;

    // Filter: High Contrast for better reading
    ctx.filter = 'contrast(200%) grayscale(100%) invert(100%)';
    ctx.drawImage(imgElement, cropX, 0, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    const croppedImage = canvas.toDataURL();

    const worker = await Tesseract.createWorker('eng');
    await worker.setParameters({
        tessedit_char_whitelist: '0123456789.', // Only look for numbers
    });

    const ret = await worker.recognize(croppedImage);
    await worker.terminate();

    // Parse findings
    const text = ret.data.text;
    console.log("Raw OCR:", text);

    // Find biggest valid price like number
    const numbers = text.match(/\d{4}\.\d{2}/g);
    if (numbers && numbers.length > 0) {
        // Return the last one found (usually bottom most or top most, assume close to price)
        return parseFloat(numbers[numbers.length - 1]);
    }

    return 0; // Failed to find proper price
}


// 3. Combine Logic
function combineLogic(price, colorData) {
    let signal = "WAIT";
    let sentiment = "Ranging";

    const totalScore = colorData.greenScore + colorData.redScore;
    if (totalScore === 0) return { signal: "ERROR", patterns: ["No clear candles found"] };

    const greenRatio = colorData.greenScore / totalScore;

    // Decision Logic
    if (greenRatio > 0.55) {
        signal = "BUY";
        sentiment = "High Bullish Volume";
    } else if (greenRatio < 0.45) {
        signal = "SELL";
        sentiment = "High Bearish Volume";
    }

    // Price Fallback
    const displayPrice = price > 0 ? price : 2025.00; // Fallback if OCR failed

    // TP/SL
    let entry = displayPrice;
    let tp, sl;

    if (signal === "BUY") {
        tp = entry + 5.00;
        sl = entry - 2.50;
    } else {
        tp = entry - 5.00;
        sl = entry + 2.50;
    }

    return {
        signal,
        entry,
        tp,
        sl,
        patterns: [
            price > 0 ? `Price Verified: ${price}` : `Price Estimate: ${displayPrice}`,
            `Bullish Pressure: ${(greenRatio * 100).toFixed(0)}%`,
            `Bearish Pressure: ${((1 - greenRatio) * 100).toFixed(0)}%`,
            colorData.greenIntensity > colorData.redIntensity ? "Strong Momentum" : "Weak Momentum"
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
