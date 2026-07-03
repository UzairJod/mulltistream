const AppState = {
    selectedSourceId: null,
    sources: [],
    highestZ: 10,
    internalWidth: 1920,
    internalHeight: 1080
};

// DOM Elements
const canvasArea = document.getElementById('preview-canvas');
const wrapperArea = document.getElementById('preview-wrapper');
const selectionOverlay = document.getElementById('selection-overlay');
const sourceList = document.getElementById('source-list');
const emptyHint = document.getElementById('canvas-empty-state');

// Tools
const btnAddSource = document.getElementById('btn-add-source');
const btnRemoveSource = document.getElementById('btn-remove-source');
const btnFitSource = document.getElementById('btn-fit-source');
const btnResetCrop = document.getElementById('btn-reset-crop');
const btnFullscreen = document.getElementById('btn-fullscreen');

// Canvas Scale Factor
let currentScaleFactor = 1;

function resizeCanvas() {
    const rect = wrapperArea.getBoundingClientRect();
    currentScaleFactor = Math.min(rect.width / AppState.internalWidth, rect.height / AppState.internalHeight);
    canvasArea.style.transform = `scale(${currentScaleFactor})`;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function getCanvasCoords(clientX, clientY) {
    const rect = canvasArea.getBoundingClientRect();
    return {
        x: (clientX - rect.left) / currentScaleFactor,
        y: (clientY - rect.top) / currentScaleFactor
    };
}

function generateId() {
    return 'src-' + Math.random().toString(36).substr(2, 9);
}

// --- Source Management ---

async function addSource() {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { 
                displaySurface: "browser",
                frameRate: { ideal: 60, max: 60 },
                width: { ideal: 1920, max: 3840 },
                height: { ideal: 1080, max: 2160 }
            },
            audio: true
        });
        
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.srcObject = stream;
        
        video.addEventListener('loadedmetadata', () => {
            AppState.highestZ++;
            
            const originalWidth = video.videoWidth || 1920;
            const originalHeight = video.videoHeight || 1080;
            
            // Scale to fit the canvas entirely
            const initScale = Math.min(
                AppState.internalWidth / originalWidth,
                AppState.internalHeight / originalHeight
            ) || 1;
            
            // Get the window or tab title from the track label
            const label = stream.getVideoTracks()[0].label || `Source ${AppState.sources.length + 1}`;
            
            const newSource = {
                id: generateId(),
                title: label,
                stream: stream,
                videoElement: video,
                originalWidth,
                originalHeight,
                x: AppState.internalWidth / 2 - (originalWidth * initScale) / 2,
                y: AppState.internalHeight / 2 - (originalHeight * initScale) / 2,
                scale: initScale,
                cropTop: 0,
                cropBottom: 0,
                cropLeft: 0,
                cropRight: 0,
                zIndex: AppState.highestZ,
                opacity: 1.0,
                locked: false,
                visible: true,
                volume: 1.0,
                muted: false
            };
            
            AppState.sources.push(newSource);
            renderSourceDOM(newSource);
            renderSourceControl(newSource);
            
            stream.getVideoTracks()[0].addEventListener('ended', () => {
                removeSource(newSource.id);
            });
            
            selectSource(newSource.id);
            updateEmptyState();
            renderLoop(); // Ensure loop is running
        }, { once: true }); // Prevent infinite duplication if metadata reloads
    } catch (e) {
        console.error("Display media error:", e);
    }
}

function removeSource(id) {
    const idx = AppState.sources.findIndex(s => s.id === id);
    if (idx !== -1) {
        const src = AppState.sources[idx];
        src.stream.getTracks().forEach(t => t.stop());
        
        const dom = document.getElementById(src.id);
        if (dom) dom.remove();
        
        const row = document.querySelector(`.source-control-row[data-id="${src.id}"]`);
        if (row) row.remove();
        
        AppState.sources.splice(idx, 1);
        
        if (AppState.selectedSourceId === id) {
            selectSource(null);
        }
        updateEmptyState();
    }
}

function selectSource(id) {
    AppState.selectedSourceId = id;
    
    // Update DOM selection visuals
    document.querySelectorAll('.source-container').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.source-control-row').forEach(el => el.classList.remove('selected'));
    
    if (id) {
        const dom = document.getElementById(id);
        if (dom) dom.classList.add('selected');
        const row = document.querySelector(`.source-control-row[data-id="${id}"]`);
        if (row) row.classList.add('selected');
        
        selectionOverlay.style.display = 'block';
    } else {
        selectionOverlay.style.display = 'none';
    }
    
    syncOverlay();
}

function updateEmptyState() {
    emptyHint.style.display = AppState.sources.length === 0 ? 'block' : 'none';
}

// --- DOM Rendering ---

function renderSourceDOM(src) {
    const tpl = document.getElementById('tpl-source-container');
    const clone = tpl.content.cloneNode(true);
    const container = clone.querySelector('.source-container');
    container.id = src.id;
    
    const offsetDiv = container.querySelector('.video-offset');
    offsetDiv.appendChild(src.videoElement);
    
    // Interactions
    container.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        selectSource(src.id);
        if (!src.locked) {
            startDrag(e, src);
        }
    });
    
    canvasArea.appendChild(container);
}

function renderSourceControl(src) {
    const tpl = document.getElementById('tpl-source-control-row');
    const clone = tpl.content.cloneNode(true);
    const row = clone.querySelector('.source-control-row');
    row.dataset.id = src.id;
    
    const title = row.querySelector('.source-title');
    title.textContent = src.title || `Source`;
    
    row.querySelector('.row-header').addEventListener('click', (e) => {
        // Prevent click if hitting a button
        if(e.target.closest('button')) return;
        selectSource(src.id);
        const dom = document.getElementById(src.id);
        if (dom) dom.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    // Visibility
    const btnVisible = row.querySelector('.btn-toggle-visible');
    const iconEye = row.querySelector('.icon-eye');
    const iconEyeOff = row.querySelector('.icon-eye-off');
    btnVisible.addEventListener('click', () => {
        src.visible = !src.visible;
        iconEye.style.display = src.visible ? 'block' : 'none';
        iconEyeOff.style.display = src.visible ? 'none' : 'block';
    });

    // Lock
    const btnLock = row.querySelector('.btn-toggle-lock');
    const iconUnlock = row.querySelector('.icon-unlock');
    const iconLock = row.querySelector('.icon-lock');
    btnLock.addEventListener('click', () => {
        src.locked = !src.locked;
        iconUnlock.style.display = src.locked ? 'none' : 'block';
        iconLock.style.display = src.locked ? 'block' : 'none';
        syncOverlay();
    });

    // Audio
    const btnMute = row.querySelector('.btn-mute');
    const inpVol = row.querySelector('.inp-volume');
    const iconVol = row.querySelector('.icon-vol');
    const iconMute = row.querySelector('.icon-muted');
    
    inpVol.addEventListener('input', (e) => {
        src.volume = parseFloat(e.target.value);
        src.muted = (src.volume === 0);
        src.videoElement.volume = src.volume;
        src.videoElement.muted = src.muted;
        updateAudioIcons();
    });
    btnMute.addEventListener('click', () => {
        src.muted = !src.muted;
        src.videoElement.muted = src.muted;
        if(src.muted) { inpVol.value = 0; } else { inpVol.value = src.volume; }
        updateAudioIcons();
    });
    function updateAudioIcons() {
        iconVol.style.display = src.muted ? 'none' : 'block';
        iconMute.style.display = src.muted ? 'block' : 'none';
    }

    // Opacity
    const inpOpacity = row.querySelector('.inp-opacity');
    inpOpacity.addEventListener('input', (e) => {
        src.opacity = parseFloat(e.target.value);
    });

    // Z-Order
    row.querySelector('.btn-z-down').addEventListener('click', () => { src.zIndex--; });
    row.querySelector('.btn-z-up').addEventListener('click', () => { src.zIndex++; });
    row.querySelector('.btn-z-bottom').addEventListener('click', () => { src.zIndex = 1; });
    row.querySelector('.btn-z-top').addEventListener('click', () => { 
        AppState.highestZ++; 
        src.zIndex = AppState.highestZ; 
    });

    // Crop Inputs
    const iTop = row.querySelector('.inp-crop-top');
    const iBot = row.querySelector('.inp-crop-bottom');
    const iLef = row.querySelector('.inp-crop-left');
    const iRig = row.querySelector('.inp-crop-right');
    
    // Save references to update inputs visually when cropping via canvas
    src.cropInputs = { top: iTop, bottom: iBot, left: iLef, right: iRig };
    
    const updateCrops = () => {
        const newTop = parseInt(iTop.value) || 0;
        const newBot = parseInt(iBot.value) || 0;
        const newLef = parseInt(iLef.value) || 0;
        const newRig = parseInt(iRig.value) || 0;
        
        // Adjust x and y so manual cropping also stays in place visually
        src.x += (newLef - src.cropLeft) * src.scale;
        src.y += (newTop - src.cropTop) * src.scale;

        src.cropTop = newTop;
        src.cropBottom = newBot;
        src.cropLeft = newLef;
        src.cropRight = newRig;
        syncOverlay();
    };
    [iTop, iBot, iLef, iRig].forEach(inp => inp.addEventListener('change', updateCrops));

    sourceList.appendChild(row);
}

// --- Render Loop ---
let isRendering = false;
function renderLoop() {
    if (!isRendering) {
        isRendering = true;
        requestAnimationFrame(doRender);
    }
}
function doRender() {
    AppState.sources.forEach(src => {
        const dom = document.getElementById(src.id);
        if (!dom) return;
        
        dom.style.display = src.visible ? 'block' : 'none';
        dom.style.zIndex = src.zIndex;
        dom.style.opacity = src.opacity;
        
        if (src.locked) {
            dom.classList.add('locked');
        } else {
            dom.classList.remove('locked');
        }
        
        dom.style.transform = `translate(${src.x}px, ${src.y}px) scale(${src.scale})`;
        
        const wrapper = dom.querySelector('.crop-wrapper');
        const boxW = Math.max(0, src.originalWidth - src.cropLeft - src.cropRight);
        const boxH = Math.max(0, src.originalHeight - src.cropTop - src.cropBottom);
        
        wrapper.style.width = `${boxW}px`;
        wrapper.style.height = `${boxH}px`;
        
        const offsetDiv = wrapper.querySelector('.video-offset');
        offsetDiv.style.position = 'absolute';
        offsetDiv.style.width = `${src.originalWidth}px`;
        offsetDiv.style.height = `${src.originalHeight}px`;
        offsetDiv.style.left = `-${src.cropLeft}px`;
        offsetDiv.style.top = `-${src.cropTop}px`;
        
        const vid = offsetDiv.querySelector('video');
        vid.style.position = 'absolute';
        vid.style.left = '0px';
        vid.style.top = '0px';
        vid.style.width = `${src.originalWidth}px`;
        vid.style.height = `${src.originalHeight}px`;
        vid.style.objectFit = 'fill';
        
        // Sync Inputs
        if (src.cropInputs) {
            if (document.activeElement !== src.cropInputs.top) src.cropInputs.top.value = Math.round(src.cropTop);
            if (document.activeElement !== src.cropInputs.bottom) src.cropInputs.bottom.value = Math.round(src.cropBottom);
            if (document.activeElement !== src.cropInputs.left) src.cropInputs.left.value = Math.round(src.cropLeft);
            if (document.activeElement !== src.cropInputs.right) src.cropInputs.right.value = Math.round(src.cropRight);
        }
    });
    
    syncOverlay();
    
    requestAnimationFrame(doRender);
}

function syncOverlay() {
    if (!AppState.selectedSourceId) return;
    const src = AppState.sources.find(s => s.id === AppState.selectedSourceId);
    if (!src || !src.visible) {
        selectionOverlay.style.display = 'none';
        return;
    }
    selectionOverlay.style.display = 'block';
    
    if (src.locked) {
        selectionOverlay.classList.add('locked');
    } else {
        selectionOverlay.classList.remove('locked');
    }
    
    const boxW = Math.max(0, src.originalWidth - src.cropLeft - src.cropRight);
    const boxH = Math.max(0, src.originalHeight - src.cropTop - src.cropBottom);
    
    selectionOverlay.style.width = `${boxW}px`;
    selectionOverlay.style.height = `${boxH}px`;
    selectionOverlay.style.transform = `translate(${src.x}px, ${src.y}px) scale(${src.scale})`;
    
    // Inverse scale the handles so they always look 10x10 px
    const invScale = 1 / src.scale;
    selectionOverlay.querySelectorAll('.resize-handle').forEach(h => {
        // Need to preserve the translation (-50%, -50%) of the handle
        h.style.transform = `translate(-50%, -50%) scale(${invScale})`;
    });
}

// --- Interaction Logic (Drag & Resize & Crop) ---

function getBoxW(src) { return Math.max(0, src.originalWidth - src.cropLeft - src.cropRight); }
function getBoxH(src) { return Math.max(0, src.originalHeight - src.cropTop - src.cropBottom); }

function startDrag(e, src) {
    const startCoords = getCanvasCoords(e.clientX, e.clientY);
    const startX = src.x;
    const startY = src.y;

    const onMove = (me) => {
        const coords = getCanvasCoords(me.clientX, me.clientY);
        src.x = startX + (coords.x - startCoords.x);
        src.y = startY + (coords.y - startCoords.y);
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

selectionOverlay.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const src = AppState.sources.find(s => s.id === AppState.selectedSourceId);
    if (!src || src.locked) return;

    if (e.target.classList.contains('resize-handle')) {
        e.stopPropagation(); // Don't trigger drag on the overlay itself
        const handleType = e.target.dataset.handle;
        const isCropping = e.altKey;
        startResizeOrCrop(e, src, handleType, isCropping);
    } else {
        // Dragging via overlay body
        startDrag(e, src);
    }
});

function startResizeOrCrop(e, src, handleType, isCropping) {
    const startCoords = getCanvasCoords(e.clientX, e.clientY);
    
    // Capture initial state
    const initX = src.x;
    const initY = src.y;
    const initScale = src.scale;
    const initCropTop = src.cropTop;
    const initCropBot = src.cropBottom;
    const initCropLef = src.cropLeft;
    const initCropRig = src.cropRight;
    const initW = getBoxW(src);
    const initH = getBoxH(src);

    const aspect = initW / initH;

    const onMove = (me) => {
        const coords = getCanvasCoords(me.clientX, me.clientY);
        const dx = coords.x - startCoords.x;
        const dy = coords.y - startCoords.y;

        if (isCropping) {
            // Cropping Math
            // dx/dy are in canvas pixels. We convert to original video pixels.
            const dVidX = dx / initScale;
            const dVidY = dy / initScale;

            if (handleType.includes('w')) {
                src.cropLeft = Math.max(0, initCropLef + dVidX);
                src.x = initX + (src.cropLeft - initCropLef) * initScale;
            }
            if (handleType.includes('e')) {
                src.cropRight = Math.max(0, initCropRig - dVidX);
            }
            if (handleType.includes('n')) {
                src.cropTop = Math.max(0, initCropTop + dVidY);
                src.y = initY + (src.cropTop - initCropTop) * initScale;
            }
            if (handleType.includes('s')) {
                src.cropBottom = Math.max(0, initCropBot - dVidY);
            }
            
            // Prevent cropping past the opposite edge
            if(src.originalWidth - src.cropLeft - src.cropRight < 0) {
                if(handleType.includes('w')) src.cropLeft = src.originalWidth - src.cropRight;
                if(handleType.includes('e')) src.cropRight = src.originalWidth - src.cropLeft;
            }
            if(src.originalHeight - src.cropTop - src.cropBottom < 0) {
                if(handleType.includes('n')) src.cropTop = src.originalHeight - src.cropBottom;
                if(handleType.includes('s')) src.cropBottom = src.originalHeight - src.cropTop;
            }

        } else {
            // Scaling Math (Maintain Aspect Ratio)
            let newW = initW;
            let newH = initH;

            // Calculate unconstrained size changes
            if (handleType.includes('e')) newW = initW + dx / initScale;
            if (handleType.includes('w')) newW = initW - dx / initScale;
            if (handleType.includes('s')) newH = initH + dy / initScale;
            if (handleType.includes('n')) newH = initH - dy / initScale;

            // Constrain to aspect ratio using the dominant axis change
            let scaleMultiplier = 1.0;
            if (handleType === 'e' || handleType === 'w') {
                scaleMultiplier = newW / initW;
            } else if (handleType === 'n' || handleType === 's') {
                scaleMultiplier = newH / initH;
            } else {
                // Diagonal: pick the larger magnitude scale to mimic intuitive corner drag
                const sx = newW / initW;
                const sy = newH / initH;
                scaleMultiplier = Math.abs(sx - 1) > Math.abs(sy - 1) ? sx : sy;
            }

            // Prevent extreme shrinking
            if (initW * scaleMultiplier < 20 || initH * scaleMultiplier < 20) return;

            src.scale = initScale * scaleMultiplier;

            // Adjust X and Y based on anchor point
            if (handleType.includes('w')) {
                src.x = initX + (initW * initScale) - (initW * src.scale);
            }
            if (handleType.includes('n')) {
                src.y = initY + (initH * initScale) - (initH * src.scale);
            }
        }
    };

    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

// --- Global Shortcuts & Toolbars ---

document.addEventListener('keydown', (e) => {
    // Ignore if typing in an input
    if (e.target.tagName === 'INPUT') return;

    if (e.code === 'Space') {
        e.preventDefault();
        document.body.classList.toggle('hide-ui');
        setTimeout(resizeCanvas, 50); // allow flex layout to settle
    }
    
    if (e.code === 'Delete' || e.code === 'Backspace') {
        if (AppState.selectedSourceId) {
            removeSource(AppState.selectedSourceId);
        }
    }
    
    if (e.ctrlKey && e.code === 'KeyD') {
        e.preventDefault();
        // Duplication is complex due to MediaStream tracking, skipping deep clone for now, 
        // a simple approach would require requesting display media again or capturing stream. 
        // For security/privacy, browser requires interaction for displayMedia. 
        console.warn("Duplicate via Ctrl+D requires explicit permissions for new stream.");
    }

    if (e.ctrlKey && (e.code === 'Digit0' || e.code === 'Numpad0')) {
        e.preventDefault();
        fitSelected();
    }
    
    if (e.ctrlKey && e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
    }
});

function fitSelected() {
    const src = AppState.sources.find(s => s.id === AppState.selectedSourceId);
    if (!src) return;
    
    const w = getBoxW(src);
    const h = getBoxH(src);
    
    // Calculate scale to fit 1920x1080
    const scale = Math.min(AppState.internalWidth / w, AppState.internalHeight / h);
    src.scale = scale;
    src.x = AppState.internalWidth / 2 - (w * scale) / 2;
    src.y = AppState.internalHeight / 2 - (h * scale) / 2;
}

// Deselect on canvas click
canvasArea.addEventListener('mousedown', (e) => {
    if (e.target === canvasArea) {
        selectSource(null);
    }
});

btnAddSource.addEventListener('click', addSource);
btnRemoveSource.addEventListener('click', () => {
    if (AppState.selectedSourceId) removeSource(AppState.selectedSourceId);
});
btnFitSource.addEventListener('click', fitSelected);
btnResetCrop.addEventListener('click', () => {
    const src = AppState.sources.find(s => s.id === AppState.selectedSourceId);
    if (src) {
        src.cropTop = 0; src.cropBottom = 0; src.cropLeft = 0; src.cropRight = 0;
        syncOverlay();
    }
});

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        wrapperArea.requestFullscreen().catch(() => {});
    } else {
        document.exitFullscreen();
    }
}
btnFullscreen.addEventListener('click', toggleFullscreen);

// Fullscreen mouse movement controls visibility
let fsTimer;
wrapperArea.addEventListener('mousemove', () => {
    if (document.fullscreenElement) {
        document.body.classList.remove('hide-ui');
        clearTimeout(fsTimer);
        fsTimer = setTimeout(() => {
            if (document.fullscreenElement) {
                document.body.classList.add('hide-ui');
            }
        }, 2000);
    }
});
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        document.body.classList.remove('hide-ui');
        clearTimeout(fsTimer);
        setTimeout(resizeCanvas, 50);
    } else {
        setTimeout(resizeCanvas, 50);
    }
});

// --- Shortcuts Modal ---
const modalShortcuts = document.getElementById('modal-shortcuts');
document.getElementById('btn-shortcuts').addEventListener('click', () => {
    modalShortcuts.style.display = 'flex';
});
document.getElementById('btn-close-shortcuts').addEventListener('click', () => {
    modalShortcuts.style.display = 'none';
});
modalShortcuts.addEventListener('click', (e) => {
    if (e.target === modalShortcuts) {
        modalShortcuts.style.display = 'none';
    }
});

// Start loop
renderLoop();
