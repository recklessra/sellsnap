/**
 * SellSnap - Image Processor Engine
 */

const state = {
    images: [],
    condition: '美品',
    isProcessing: false
};

// DOM Elements
const fileInput = document.getElementById('fileInput');
const conditionBtns = document.querySelectorAll('.condition-btn');
const galleryGrid = document.getElementById('galleryGrid');
const gallerySection = document.getElementById('gallerySection');
const actionFooter = document.getElementById('actionFooter');
const saveAllBtn = document.getElementById('saveAllBtn');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');

// Constants
const TARGET_SIZE = 1200; // Output resolution 1200x1200px
const BORDER_WIDTH = 35;  // Thicker Red border
const SATURATION_BOOST = 1.3;

// Initialize
conditionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        conditionBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.condition = btn.dataset.value;
        if (state.images.length > 0) {
            processAllImages();
        }
    });
});

fileInput.addEventListener('change', handleFileSelect);

async function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    showLoading(`画像を読み込み中... (0/${files.length})`);
    
    state.images = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const img = await loadImage(file);
        state.images.push({
            original: img,
            name: file.name.split('.')[0]
        });
        updateLoadingText(`画像を読み込み中... (${i + 1}/${files.length})`);
    }

    processAllImages();
}

function loadImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

async function processAllImages() {
    state.isProcessing = true;
    showLoading(`加工中...`);
    galleryGrid.innerHTML = '';
    
    for (let i = 0; i < state.images.length; i++) {
        const item = state.images[i];
        updateLoadingText(`加工中... (${i + 1}/${state.images.length})`);
        
        const canvas = document.createElement('canvas');
        canvas.width = TARGET_SIZE;
        canvas.height = TARGET_SIZE;
        
        item.condition = state.condition; 
        const detectedPos = await processImage(item.original, canvas, item.condition);
        item.pos = detectedPos;
        item.processedCanvas = canvas;
        
        const card = createPreviewCard(item, i);
        galleryGrid.appendChild(card);
    }

    gallerySection.style.display = 'block';
    actionFooter.style.display = 'block';
    hideLoading();
    state.isProcessing = false;
    
    // Scroll to gallery
    gallerySection.scrollIntoView({ behavior: 'smooth' });
}

async function processImage(img, canvas, condition, customPos) {
    const ctx = canvas.getContext('2d');
    
    // 1. Calculate Crop (1:1 Center Crop)
    const minDim = Math.min(img.width, img.height);
    const sx = (img.width - minDim) / 2;
    const sy = (img.height - minDim) / 2;

    // 2. Draw Image with Saturation Boost
    ctx.save();
    if (ctx.filter !== undefined) {
        ctx.filter = `saturate(${SATURATION_BOOST})`;
    }
    ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, TARGET_SIZE, TARGET_SIZE);
    ctx.restore();

    // 3. Draw Red Border
    ctx.strokeStyle = '#ff0000'; 
    ctx.lineWidth = BORDER_WIDTH * 2; 
    ctx.strokeRect(0, 0, TARGET_SIZE, TARGET_SIZE);

    // 4. Label Placement
    let finalPos;
    if (customPos) {
        finalPos = typeof customPos === 'number' ? { type: 'top', value: customPos } : customPos;
    } else {
        const autoY = determineLabelPosition(ctx, TARGET_SIZE);
        finalPos = { type: 'top', value: autoY };
    }
    
    drawLabel(ctx, condition, finalPos, TARGET_SIZE);
    return finalPos;
}

function determineLabelPosition(ctx, size) {
    const scanHeight = Math.floor(size * 0.8);
    const data = ctx.getImageData(0, 0, size, scanHeight).data;
    let productTopY = scanHeight;

    for (let y = BORDER_WIDTH + 80; y < scanHeight; y += 4) {
        let rowWeight = 0;
        for (let x = BORDER_WIDTH + 50; x < size - BORDER_WIDTH - 50; x += 10) {
            const idx = (y * size + x) * 4;
            const lum = (0.299 * data[idx] + 0.587 * data[idx+1] + 0.114 * data[idx+2]);
            const saturation = Math.max(data[idx], data[idx+1], data[idx+2]) - Math.min(data[idx], data[idx+1], data[idx+2]);
            if (lum < 180 || saturation > 30) rowWeight++;
        }
        if (rowWeight > (size / 10) * 0.15) {
            productTopY = y;
            break;
        }
    }
    return Math.max(250, productTopY - 60);
}

function drawLabel(ctx, text, pos, size) {
    // Normalize position: if numeric, treat as horizontal 'top' type
    const normalizedPos = typeof pos === 'number' ? { type: 'top', value: pos } : pos;
    
    if (normalizedPos.type === 'top') {
        drawHorizontalLabel(ctx, text, normalizedPos.value, size);
    } else {
        drawVerticalLabel(ctx, text, normalizedPos, size);
    }
}

function drawHorizontalLabel(ctx, text, bottomY, size) {
    const labelX = BORDER_WIDTH;
    const labelY = BORDER_WIDTH;
    const labelW = size - (BORDER_WIDTH * 2);
    const labelH = bottomY - BORDER_WIDTH;

    ctx.fillStyle = '#ffff00';
    ctx.fillRect(labelX, labelY, labelW, labelH);

    let fontSize = 600;
    const paddingH = 60;
    const paddingV = 50;
    while (fontSize > 50) {
        ctx.font = `bold ${fontSize}px sans-serif`;
        const metrics = ctx.measureText(text);
        if (metrics.width < labelW - paddingH && fontSize < labelH - paddingV) break;
        fontSize -= 5;
    }

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, labelY + (labelH / 2) + (fontSize * 0.05));
}

function drawVerticalLabel(ctx, text, pos, size) {
    const isRight = pos.type === 'right';
    // Now pos.value represents the WIDTH of the label
    const actualLabelW = Math.max(150, Math.min(600, pos.value));
    const labelH = size - (BORDER_WIDTH * 2);
    const labelX = isRight ? size - BORDER_WIDTH - actualLabelW : BORDER_WIDTH;
    const labelY = BORDER_WIDTH;

    // Draw Yellow Background
    ctx.fillStyle = '#ffff00';
    ctx.fillRect(labelX, labelY, actualLabelW, labelH);

    // Vertical Text Drawing
    let fontSize = 600;
    const padding = 40;
    const chars = text.split('');
    
    // Find font size that fits vertically and horizontally
    while (fontSize > 50) {
        ctx.font = `bold ${fontSize}px sans-serif`;
        const charW = ctx.measureText('美').width;
        const totalH = fontSize * chars.length;
        if (charW < actualLabelW - padding && totalH < labelH - padding) break;
        fontSize -= 5;
    }

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    const startY = labelY + (labelH - (fontSize * chars.length)) / 2;
    chars.forEach((char, i) => {
        ctx.fillText(char, labelX + (actualLabelW / 2), startY + (i * fontSize));
    });
}

function createPreviewCard(item, index) {
    const div = document.createElement('div');
    div.className = 'preview-card';
    
    const imgElement = document.createElement('img');
    imgElement.src = item.processedCanvas.toDataURL('image/jpeg', 0.9);
    
    if (!item.condition) item.condition = state.condition;

    const controls = document.createElement('div');
    controls.className = 'preview-controls';
    
    const conditions = ['新品未使用', '極美品', '美品', '良品'];
    let conditionHtml = `<div class="mini-condition-grid">`;
    conditions.forEach(c => {
        conditionHtml += `<button class="mini-btn ${item.condition === c ? 'active' : ''}" data-val="${c}">${c}</button>`;
    });
    conditionHtml += `</div>`;

    if (!item.pos) item.pos = { type: 'top', value: 300 };
    const isVertical = item.pos.type === 'right';
    const displayVal = isVertical ? item.pos.value : item.pos.value; // For horizontal, value is bottomY. For vertical, it's width.

    controls.innerHTML = `
        <button class="share-btn" id="share-${index}">
            <i>📤</i> 写真アプリに保存
        </button>
        <div class="control-label">
            <span>配置を選択</span>
        </div>
        <div class="mini-condition-grid">
            <button class="mini-btn ${!isVertical ? 'active' : ''}" data-pos="top">横（上）</button>
            <button class="mini-btn ${isVertical ? 'active' : ''}" data-pos="right">縦（右）</button>
        </div>
        <div class="control-label">
            <span>状態を選択</span>
        </div>
        ${conditionHtml}
        <div class="control-label">
            <span>${isVertical ? '横幅を調整' : '高さを調整'}</span>
            <span id="val-${index}">${Math.round(displayVal)}px</span>
        </div>
        <div class="slider-container">
            <input type="range" min="150" max="${isVertical ? 600 : 900}" value="${displayVal}" step="10" id="slider-${index}">
        </div>
    `;

    const info = document.createElement('div');
    info.className = 'preview-info';
    info.innerText = item.name;
    
    div.appendChild(imgElement);
    div.appendChild(controls);
    div.appendChild(info);

    // Share API Event
    const shareBtn = controls.querySelector('.share-btn');
    shareBtn.addEventListener('click', async () => {
        try {
            const blob = await (await fetch(imgElement.src)).blob();
            const file = new File([blob], `sellsnap_${item.name}.jpg`, { type: 'image/jpeg' });
            
            if (navigator.share) {
                await navigator.share({
                    files: [file],
                    title: 'SellSnap Image',
                });
            } else {
                // Fallback for browsers without Share API
                const link = document.createElement('a');
                link.download = `sellsnap_${item.name}.jpg`;
                link.href = imgElement.src;
                link.click();
            }
        } catch (err) {
            console.error('Share failed:', err);
        }
    });

    // Add Slider Event
    const slider = controls.querySelector('input');
    slider.addEventListener('input', async (e) => {
        const newVal = parseInt(e.target.value);
        item.pos.value = newVal;
        document.getElementById(`val-${index}`).innerText = `${newVal}px`;
        await processImage(item.original, item.processedCanvas, item.condition, item.pos);
        imgElement.src = item.processedCanvas.toDataURL('image/jpeg', 0.9);
    });

    // Add Position Toggle Events
    const posBtns = controls.querySelectorAll('[data-pos]');
    posBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            posBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const type = btn.dataset.pos;
            if (type === 'top') {
                const autoY = determineLabelPosition(item.processedCanvas.getContext('2d'), TARGET_SIZE);
                item.pos = { type: 'top', value: autoY };
                slider.min = 150;
                slider.max = 900;
            } else {
                item.pos = { type: 'right', value: 250 }; // Default width
                slider.min = 150;
                slider.max = 600;
            }
            slider.value = item.pos.value;
            document.getElementById(`val-${index}`).innerText = `${item.pos.value}px`;
            await processImage(item.original, item.processedCanvas, item.condition, item.pos);
            imgElement.src = item.processedCanvas.toDataURL('image/jpeg', 0.9);
            // Refresh labels
            controls.querySelector('.control-label:nth-of-type(3) span:first-child').innerText = type === 'top' ? '高さを調整' : '横幅を調整';
        });
    });

    // Add Mini Button Events
    const miniBtns = controls.querySelectorAll('[data-val]');
    miniBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            miniBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            item.condition = btn.dataset.val;
            await processImage(item.original, item.processedCanvas, item.condition, item.pos);
            imgElement.src = item.processedCanvas.toDataURL('image/jpeg', 0.9);
        });
    });
    
    return div;
}

// Batch Download Logic
saveAllBtn.addEventListener('click', async () => {
    if (state.isProcessing) return;
    
    showLoading('連続保存を開始します...');
    
    for (let i = 0; i < state.images.length; i++) {
        const item = state.images[i];
        const link = document.createElement('a');
        link.download = `sellsnap_${item.name}.jpg`;
        link.href = item.processedCanvas.toDataURL('image/jpeg', 0.9);
        
        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Short delay to avoid browser blocking multiple downloads
        await new Promise(r => setTimeout(r, 800));
        updateLoadingText(`保存中... (${i + 1}/${state.images.length})`);
    }
    
    hideLoading();
    alert('保存が完了しました。ブラウザのダウンロード履歴または写真ライブラリを確認してください。');
});

function showLoading(text) {
    loadingText.innerText = text;
    loadingOverlay.style.display = 'flex';
}

function updateLoadingText(text) {
    loadingText.innerText = text;
}

function hideLoading() {
    loadingOverlay.style.display = 'none';
}
