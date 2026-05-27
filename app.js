// Main Application Code for 'Read All About Me' - INTERACTIVE DIGITAL ARCHIVE

let PERSONAS_LIST = [];
let currentLang = 'he'; // Default is Hebrew
let isZooming = false;
let zoomTimeout = null;
let personaAnchors = {};
const CARD_SIZE = 138; // Fixed height of the thumbnail cards

// Spatial Board Dimensions (Spacious canvas to create distinct islands and avoid overlaps)
const WORLD_WIDTH = 8800;
const WORLD_HEIGHT = 6600;

// Pan and Zoom states
let panOffset = { x: 0, y: 0 };
let zoomScale = 1.0;
let isPanning = false;
let isPinching = false;
let lastPanPos = { x: 0, y: 0 };
let activeCategory = null;

// Touch Zoom tracking variables
let initialTouchDist = 0;
let initialTouchScale = 1.0;
let initialWorldMid = { x: 0, y: 0 };

// Modal navigation items collection
let currentPersonaItems = [];
let currentItemIndex = -1;

// Tight, mathematically non-overlapping grid offsets around the centered persona name
// Maximum offset radius is 180px, leaving a clear zone in the center for the name label
const LOCAL_GRID_OFFSETS = [
    // Layer 1 (Inner ring - 20% scaled for larger cards to avoid overlaps)
    { dx: 265, dy: 0 },    // Right
    { dx: -265, dy: 0 },   // Left
    { dx: 0, dy: 170 },    // Down
    { dx: 0, dy: -170 },   // Up
    { dx: 240, dy: 170 },  // Bottom-Right
    { dx: -240, dy: -170 },// Top-Left
    { dx: 240, dy: -170 }, // Top-Right
    { dx: -240, dy: 170 }, // Bottom-Left

    // Layer 2 (Outer ring)
    { dx: 0, dy: 325 },    // Far Down
    { dx: 0, dy: -325 },   // Far Up
    { dx: 240, dy: 325 },  // Far Bottom-Right
    { dx: -240, dy: -325 },// Far Top-Left
    { dx: 240, dy: -325 }, // Far Top-Right
    { dx: -240, dy: 325 }, // Far Bottom-Left
    { dx: 480, dy: 0 },    // Far Right
    { dx: -480, dy: 0 },   // Far Left
    { dx: 480, dy: 170 },  // Far Bottom-Right Extra
    { dx: -480, dy: -170 },// Far Top-Left Extra
    { dx: 480, dy: -170 }, // Far Top-Right Extra
    { dx: -480, dy: 170 }  // Far Bottom-Left Extra
];

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    // Center the viewport on the middle of the board initially
    panOffset.x = window.innerWidth / 2 - WORLD_WIDTH / 2;
    panOffset.y = window.innerHeight / 2 - WORLD_HEIGHT / 2;
    updateContainerTransform();

    extractPersonas();
    calculatePersonaAnchors();
    renderBoard();
    setupCategoryFiltering();
    setupEventListeners();
    setupLanguageSwitch();
    
    // Recalculate anchors on window resize to keep layout bounds intact
    window.addEventListener('resize', () => {
        if (activeCategory) {
            // In category view, keep the viewport centered exactly on the cluster center
            panOffset.x = window.innerWidth / 2 - (WORLD_WIDTH / 2) * zoomScale;
            panOffset.y = window.innerHeight / 2 - (WORLD_HEIGHT / 2) * zoomScale;
            updateContainerTransform();
            return;
        }
        // No boundaries constraints on homepage: allow infinite panning
    });
});

// Extract unique personas dynamically from ARCHIVE_DATA
function extractPersonas() {
    const uniquePersonas = {};
    
    if (typeof ARCHIVE_DATA === 'undefined') {
        console.error('ARCHIVE_DATA is not defined!');
        return;
    }
    
    ARCHIVE_DATA.forEach(item => {
        if (item.personaKey && item.persona) {
            if (!uniquePersonas[item.personaKey]) {
                uniquePersonas[item.personaKey] = {
                    key: item.personaKey,
                    name: item.persona
                };
            }
        }
    });
    
    // Sort personas initially alphabetically
    PERSONAS_LIST = Object.values(uniquePersonas).sort((a, b) => a.name.localeCompare(b.name, 'he'));
    console.log(`Loaded ${PERSONAS_LIST.length} unique personas dynamically.`);
}

// Calculate positioning anchors dynamically in an organic concentric ring distribution
// This centers popular personas and scatters others non-linearly with large gaps
function calculatePersonaAnchors() {
    const count = PERSONAS_LIST.length;
    if (count === 0) return;

    // Sort personas by item count descending so content-rich personas appear at the center
    PERSONAS_LIST.forEach(persona => {
        persona.itemCount = ARCHIVE_DATA.filter(item => item.personaKey === persona.key).length;
    });
    PERSONAS_LIST.sort((a, b) => b.itemCount - a.itemCount);

    const centerX = WORLD_WIDTH / 2;
    const centerY = WORLD_HEIGHT / 2;

    // Concentric ring definitions: { radius, count }
    // Spaced out by 950px radially, staggered and jittered deterministically
    const ringDefinitions = [
        { radius: 0, count: 1 },
        { radius: 950, count: 6 },
        { radius: 1900, count: 12 },
        { radius: 2850, count: 16 },
        { radius: 3800, count: 16 }
    ];

    let personaIndex = 0;

    ringDefinitions.forEach((ring, ringIdx) => {
        const numPersonas = Math.min(ring.count, count - personaIndex);
        for (let i = 0; i < numPersonas; i++) {
            const persona = PERSONAS_LIST[personaIndex];
            
            let x, y;
            if (ring.radius === 0) {
                x = centerX;
                y = centerY;
            } else {
                // Angle spacing
                // Stagger angles between rings to make placement completely non-linear
                const angleOffset = ringIdx * 0.45;
                const angle = (i * 2 * Math.PI / numPersonas) + angleOffset;
                
                // Deterministic jitter based on persona key characters for organic scattering
                let hash = 0;
                for (let charIdx = 0; charIdx < persona.key.length; charIdx++) {
                    hash = persona.key.charCodeAt(charIdx) + ((hash << 5) - hash);
                }
                const jitterR = (hash % 100) - 50; // Jitter radius by +/- 50px
                const jitterAngle = ((hash >> 8) % 10) * 0.02 - 0.1; // Jitter angle by +/- 0.1 rad
                
                const r = ring.radius + jitterR;
                const finalAngle = angle + jitterAngle;
                
                x = centerX + Math.cos(finalAngle) * r;
                y = centerY + Math.sin(finalAngle) * r;
            }

            personaAnchors[persona.key] = { x, y };
            personaIndex++;
        }
    });
}

// Render persona labels on the side and organic card clumps (blocks) around their anchors
function renderBoard() {
    const container = document.getElementById('world-container');
    container.innerHTML = ''; // Clear container

    // 1. Render persona labels to the left or right of their card blocks
    PERSONAS_LIST.forEach(persona => {
        const anchor = personaAnchors[persona.key];
        if (!anchor) return;

        // Fetch matching items
        const itemMatches = ARCHIVE_DATA.filter(item => item.personaKey === persona.key);
        const itemCount = itemMatches.length;
        if (itemCount === 0) return;

        // Compute same grid columns as cards to place label next to it
        let cols = 3;
        if (itemCount <= 2) cols = 2;
        else if (itemCount <= 4) cols = 2;
        else if (itemCount <= 8) cols = 3;
        else cols = 4;
        
        const rows = Math.ceil(itemCount / cols);
        const spacingX = 160;
        const spacingY = 145;
        const blockWidth = (cols - 1) * spacingX;

        // Place label on the left or right of the block deterministically
        const labelOnRight = (persona.key.charCodeAt(0) % 2 === 0);
        const labelX = labelOnRight ? anchor.x + blockWidth / 2 + 220 : anchor.x - blockWidth / 2 - 220;
        const labelY = anchor.y;

        const group = document.createElement('div');
        group.className = 'persona-group';
        group.setAttribute('data-persona', persona.key);
        group.style.left = `${labelX}px`;
        group.style.top = `${labelY}px`;
        group.style.textAlign = labelOnRight ? 'left' : 'right';
        group.style.alignItems = labelOnRight ? 'flex-start' : 'flex-end';
        group.style.transform = labelOnRight ? 'translate3d(0, -50%, 0) scale(1)' : 'translate3d(-100%, -50%, 0) scale(1)';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'persona-name';
        nameDiv.textContent = persona.name;

        const countDiv = document.createElement('div');
        countDiv.className = 'persona-count';
        countDiv.textContent = `[${itemCount}]`;

        group.appendChild(nameDiv);
        group.appendChild(countDiv);
        container.appendChild(group);
    });

    // 2. Render organic card clumps (blocks) around their anchors
    PERSONAS_LIST.forEach(persona => {
        const anchor = personaAnchors[persona.key];
        if (!anchor) return;
        
        // Fetch all items of this persona
        const personaCards = ARCHIVE_DATA.filter(item => item.personaKey === persona.key);
        const K = personaCards.length;
        if (K === 0) return;
        
        // Determine grid columns for a compact mosaic block
        let cols = 3;
        if (K <= 2) cols = 2;
        else if (K <= 4) cols = 2;
        else if (K <= 8) cols = 3;
        else cols = 4;
        
        const rows = Math.ceil(K / cols);
        const spacingX = 160; // Tight spacing for mosaic clump
        const spacingY = 145;
        
        const blockWidth = (cols - 1) * spacingX;
        const blockHeight = (rows - 1) * spacingY;
        
        // Position cards in a tight block centered on the anchor
        personaCards.forEach((item, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            
            const dx = col * spacingX - blockWidth / 2;
            const dy = row * spacingY - blockHeight / 2;
            
            const cardX = anchor.x + dx;
            const cardY = anchor.y + dy;
            
            // Create card
            const card = document.createElement('div');
            card.className = 'archive-item';
            card.setAttribute('data-category', item.category);
            card.setAttribute('data-persona', persona.key);
            card.setAttribute('data-id', item.id);
            card.setAttribute('data-index', i);
            
            // Position card exactly centered on coordinates
            card.style.left = `${cardX}px`;
            card.style.top = `${cardY}px`;
            card.style.height = `${CARD_SIZE}px`;
            
            // Save homepage coordinates
            card.setAttribute('data-home-x', cardX);
            card.setAttribute('data-home-y', cardY);
            
            // Check if video or image
            const ext = item.fileName.split('.').pop().toLowerCase();
            const isVideo = ['mp4', 'webm'].includes(ext);

            let mediaEl;
            if (isVideo) {
                mediaEl = document.createElement('video');
                mediaEl.src = `assets/${item.fileName}`;
                mediaEl.autoplay = true;
                mediaEl.loop = true;
                mediaEl.muted = true;
                mediaEl.playsInline = true;
                
                mediaEl.addEventListener('loadedmetadata', () => {
                    const aspect = mediaEl.videoWidth / mediaEl.videoHeight;
                    card.style.width = `${CARD_SIZE * aspect}px`;
                });
            } else {
                mediaEl = document.createElement('img');
                mediaEl.src = `assets/${item.fileName}`;
                mediaEl.loading = 'lazy';
                
                mediaEl.addEventListener('load', () => {
                    const aspect = mediaEl.naturalWidth / mediaEl.naturalHeight;
                    card.style.width = `${CARD_SIZE * aspect}px`;
                });
            }
            card.appendChild(mediaEl);

            // Add the item number badge (metadata ID)
            const numLabel = document.createElement('div');
            numLabel.className = 'card-number';
            numLabel.textContent = item.id; // Numbered by global metadata ID!
            card.appendChild(numLabel);

            // Setup interactions
            setupCardInteractions(card, item);

            container.appendChild(card);
        });
    });
}

// Set up Hover & Click States for media cards
function setupCardInteractions(card, item) {
    const modal = document.getElementById('detail-modal');

    // Hover: bring to front (scaling and transition is fully managed in CSS)
    card.addEventListener('mouseenter', () => {
        card.style.zIndex = 100;
    });

    card.addEventListener('mouseleave', () => {
        card.style.zIndex = 5;
    });

    // Click: open modal with cross-persona navigation (walk through all items on the board)
    card.addEventListener('click', () => {
        if (activeCategory) {
            // Category: browse all items in the active category sorted chronologically
            currentPersonaItems = ARCHIVE_DATA.filter(it => it.category === activeCategory)
                                             .sort((a, b) => a.year - b.year);
        } else {
            // Homepage: browse all items in the archive sorted by persona so they group logically
            currentPersonaItems = [...ARCHIVE_DATA].sort((a, b) => a.personaKey.localeCompare(b.personaKey));
        }
        
        currentItemIndex = currentPersonaItems.findIndex(it => it.id === item.id);
        
        showItemAtIndex(currentItemIndex);
        modal.classList.add('visible');
    });
}

// Show specific detailed item inside modal with Hebrew/English support
function showItemAtIndex(index) {
    if (index < 0 || index >= currentPersonaItems.length) return;
    currentItemIndex = index;
    const item = currentPersonaItems[currentItemIndex];
    
    const modalMedia = document.getElementById('modal-media');
    const modalSource = document.getElementById('modal-source');
    const modalYear = document.getElementById('modal-year');
    const modalTitle = document.getElementById('modal-title');
    const modalQuote = document.getElementById('modal-quote');
    const modalAnalysis = document.getElementById('modal-analysis');
    const modalCategoryTag = document.getElementById('modal-category-tag');
    const modalCounter = document.getElementById('modal-counter');
    
    modalMedia.innerHTML = '';
    
    const ext = item.fileName.split('.').pop().toLowerCase();
    const isVideo = ['mp4', 'webm'].includes(ext);
    
    if (isVideo) {
        const video = document.createElement('video');
        video.src = `assets/${item.fileName}`;
        video.controls = true;
        video.autoplay = true;
        video.loop = true;
        modalMedia.appendChild(video);
    } else {
        const img = document.createElement('img');
        img.src = `assets/${item.fileName}`;
        modalMedia.appendChild(img);
    }
    
    // Render source link if sourceUrl is available
    if (item.sourceUrl) {
        modalSource.innerHTML = `<a href="${item.sourceUrl}" target="_blank" style="color: var(--accent-color); text-decoration: underline; cursor: pointer;">${item.source || 'Source Link'}</a>`;
    } else {
        modalSource.textContent = item.source || '';
    }
    
    modalYear.textContent = item.year || '';
    modalTitle.textContent = item.headline || '';
    
    // Display English or Hebrew Quote
    const quoteText = currentLang === 'en' ? (item.quoteEn || item.quote) : item.quote;
    if (quoteText) {
        modalQuote.textContent = `"${quoteText}"`;
        modalQuote.style.display = 'block';
    } else {
        modalQuote.style.display = 'none';
    }
    
    // Display English or Hebrew Analysis
    const analysisText = currentLang === 'en' ? (item.analysisEn || item.analysis) : item.analysis;
    modalAnalysis.textContent = analysisText || '';
    
    // Display English or Hebrew Category Tag
    const categoryNameText = currentLang === 'en' ? (item.categoryNameEn || item.categoryName) : item.categoryName;
    modalCategoryTag.textContent = categoryNameText || '';
    
    // Translate modal navigation buttons text
    const footerPrevBtn = document.getElementById('modal-footer-prev-btn');
    const footerNextBtn = document.getElementById('modal-footer-next-btn');
    if (footerPrevBtn) {
        footerPrevBtn.textContent = currentLang === 'he' ? "הקודם →" : "← Prev";
    }
    if (footerNextBtn) {
        footerNextBtn.textContent = currentLang === 'he' ? "← הבא" : "Next →";
    }
    
    // Render item counter at the bottom of the card details
    if (modalCounter) {
        if (currentLang === 'he') {
            modalCounter.textContent = `אייטם ${index + 1} מתוך ${currentPersonaItems.length}`;
        } else {
            modalCounter.textContent = `Item ${index + 1} of ${currentPersonaItems.length}`;
        }
    }
    
    updateModalNavigation();
    
    // Center the viewport on the selected item's card
    const activeCardEl = document.querySelector(`.archive-item[data-id="${item.id}"]`);
    if (activeCardEl) {
        const container = document.getElementById('world-container');
        container.classList.add('smooth-transition');
        
        const cardX = parseFloat(activeCardEl.style.left);
        const cardY = parseFloat(activeCardEl.style.top);
        
        panOffset.x = window.innerWidth / 2 - cardX * zoomScale;
        panOffset.y = window.innerHeight / 2 - cardY * zoomScale;
        
        if (!activeCategory) {
            // Sync mouse positions to the center of the viewport to prevent instant drift fight
            actualMousePos.x = window.innerWidth / 2;
            actualMousePos.y = window.innerHeight / 2;
            smoothMousePos.x = window.innerWidth / 2;
            smoothMousePos.y = window.innerHeight / 2;
        }
        
        updateContainerTransform();
        
        setTimeout(() => {
            container.classList.remove('smooth-transition');
        }, 800);
    }
}

// Toggle visibility of navigation buttons based on items count
function updateModalNavigation() {
    const prevBtn = document.getElementById('modal-prev-btn');
    const nextBtn = document.getElementById('modal-next-btn');
    const footerPrevBtn = document.getElementById('modal-footer-prev-btn');
    const footerNextBtn = document.getElementById('modal-footer-next-btn');
    
    if (currentPersonaItems.length <= 1) {
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        if (footerPrevBtn) footerPrevBtn.style.display = 'none';
        if (footerNextBtn) footerNextBtn.style.display = 'none';
    } else {
        if (prevBtn) prevBtn.style.display = 'flex';
        if (nextBtn) nextBtn.style.display = 'flex';
        if (footerPrevBtn) footerPrevBtn.style.display = 'flex';
        if (footerNextBtn) footerNextBtn.style.display = 'flex';
    }
}

// Hook up bottom category pills
function setupCategoryFiltering() {
    const pills = document.querySelectorAll('.category-pill');
    
    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            const category = pill.getAttribute('data-category');
            
            if (activeCategory === category) {
                activeCategory = null;
                pill.classList.remove('active');
            } else {
                pills.forEach(p => p.classList.remove('active'));
                activeCategory = category;
                pill.classList.add('active');
            }
            
            // Add temporary smooth transition class to container for camera pan
            const container = document.getElementById('world-container');
            container.classList.add('smooth-transition');
            
            if (activeCategory) {
                // Category View: Centered, Zoom-locked, sharp and clear layout grid
                zoomScale = 0.65;
                panOffset.x = window.innerWidth / 2 - (WORLD_WIDTH / 2) * zoomScale;
                panOffset.y = window.innerHeight / 2 - (WORLD_HEIGHT / 2) * zoomScale;
            } else {
                // Homepage: Centered at 1.0, drag unlocked
                zoomScale = 1.0;
                panOffset.x = window.innerWidth / 2 - WORLD_WIDTH / 2;
                panOffset.y = window.innerHeight / 2 - WORLD_HEIGHT / 2;
            }
            
            updateContainerTransform();
            
            applyFilter();
            
            if (activeCategory) {
                updateCategoryZoomEffects();
            } else {
                // Clear any leftover filter/blur styles when returning home
                document.querySelectorAll('.archive-item').forEach(card => {
                    card.style.filter = '';
                    card.style.opacity = '';
                    card.style.pointerEvents = '';
                    card.style.transform = '';
                });
            }
            
            // Remove the smooth transition class after animation completes
            setTimeout(() => {
                container.classList.remove('smooth-transition');
            }, 800);
        });
    });
}

// Apply dynamic depth layers zoom effects (no-op: everything is sharp and clear at all times)
function updateCategoryZoomEffects() {
    // No-op
}

// Filter, animate, and layout cards. Snaps active category items into a unified global grid,
// scattering inactive cards away, and hiding all persona name labels.
function applyFilter() {
    const groups = document.querySelectorAll('.persona-group');
    const allCards = document.querySelectorAll('.archive-item');
    
    // Map of cardId -> element
    const cardMap = {};
    allCards.forEach(card => {
        cardMap[card.getAttribute('data-id')] = card;
    });
    
    if (!activeCategory) {
        // Reset all cards to their default scattered grid offsets around their persona groups
        allCards.forEach(card => {
            card.classList.remove('dimmed', 'highlighted');
            card.removeAttribute('data-category-index');
            // Reset styles
            card.style.transform = '';
            card.style.filter = '';
            card.style.opacity = '';
            card.style.pointerEvents = '';
            
            // Restore homepage coordinates
            const homeX = card.getAttribute('data-home-x');
            const homeY = card.getAttribute('data-home-y');
            if (homeX !== null && homeY !== null) {
                card.style.left = `${homeX}px`;
                card.style.top = `${homeY}px`;
            }
        });
        
        // Show all persona labels
        groups.forEach(group => {
            group.classList.remove('dimmed');
            group.style.opacity = '1';
            group.style.pointerEvents = 'auto';
            group.style.visibility = 'visible';
        });
        return;
    }
    
    // Hide all persona name labels in category view
    groups.forEach(group => {
        group.classList.add('dimmed');
        group.style.opacity = '0';
        group.style.pointerEvents = 'none';
        group.style.visibility = 'hidden';
    });
    
    // Get all items matching selected category, sorted chronologically
    const matchingData = ARCHIVE_DATA.filter(item => item.category === activeCategory)
                                     .sort((a, b) => a.year - b.year);
    
    const activeCount = matchingData.length;
    const activeIds = new Set(matchingData.map(it => it.id));
    
    // Determine grid columns based on items count
    let cols = 6;
    if (activeCount <= 8) cols = 4;
    else if (activeCount <= 20) cols = 5;
    
    const rows = Math.ceil(activeCount / cols);
    const spacingX = 295; // Spacing scaled for 138px height cards
    const spacingY = 250;
    
    const gridWidth = (cols - 1) * spacingX;
    const gridHeight = (rows - 1) * spacingY;
    
    // Centered coordinates on the board
    const startX = WORLD_WIDTH / 2 - gridWidth / 2;
    const startY = WORLD_HEIGHT / 2 - gridHeight / 2;
    
    // Animate matching items into the global unified grid (perfect clarity)
    matchingData.forEach((item, index) => {
        const card = cardMap[item.id];
        if (card) {
            const c = index % cols;
            const r = Math.floor(index / cols);
            
            const x = startX + c * spacingX;
            const y = startY + r * spacingY;
            
            card.style.left = `${x}px`;
            card.style.top = `${y}px`;
            card.classList.add('highlighted');
            card.classList.remove('dimmed');
            
            // Apply full clarity and pointer events
            card.style.filter = 'none';
            card.style.opacity = '1';
            card.style.pointerEvents = 'auto';
            card.style.transform = 'translate3d(-50%, -50%, 0) scale(1.35)';
        }
    });
    
    // Disperse inactive items (flying away from their persona anchors) and fade to 0
    allCards.forEach(card => {
        const id = parseInt(card.getAttribute('data-id'));
        if (!activeIds.has(id)) {
            const personaKey = card.getAttribute('data-persona');
            const anchor = personaAnchors[personaKey];
            const i = parseInt(card.getAttribute('data-index'));
            const offset = LOCAL_GRID_OFFSETS[i % LOCAL_GRID_OFFSETS.length];
            
            // Slide outwards to 1.6x the radius and hide
            card.style.left = `${anchor.x + offset.dx * 1.6}px`;
            card.style.top = `${anchor.y + offset.dy * 1.6}px`;
            card.style.opacity = '0';
            card.style.pointerEvents = 'none';
            card.classList.add('dimmed');
            card.classList.remove('highlighted');
        }
    });
}

// Update DOM matrix transforms for Pan and Zoom
function updateContainerTransform() {
    const container = document.getElementById('world-container');
    container.style.transform = `translate3d(${panOffset.x}px, ${panOffset.y}px, 0) scale(${zoomScale})`;
}

// Setup Event Listeners for spatial board dragging (Panning), Scroll Wheel Zoom, and Resetting
function setupEventListeners() {
    // --- CLICK HEADER LOGO TO RESET / RETURN HOME ---
    const headerLogo = document.querySelector('header');
    if (headerLogo) {
        headerLogo.addEventListener('click', () => {
            // Reset viewport positioning centered on the board and zoomScale to 1.0
            zoomScale = 1.0;
            actualMousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            smoothMousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            panOffset.x = window.innerWidth / 2 - WORLD_WIDTH / 2;
            panOffset.y = window.innerHeight / 2 - WORLD_HEIGHT / 2;
            updateContainerTransform();
            
            // Optionally reset to Hebrew default or keep language state
            // Let's keep the user's preferred language state intact on logo click reset
            
            // Clear filtering category selection
            if (activeCategory) {
                activeCategory = null;
                document.querySelectorAll('.category-pill').forEach(pill => pill.classList.remove('active'));
                applyFilter();
            }
            
            // Close any open modals
            const modal = document.getElementById('detail-modal');
            if (modal && modal.classList.contains('visible')) {
                modal.classList.remove('visible');
                document.getElementById('modal-media').innerHTML = '';
            }

            // Clear any filter/blur styles
            document.querySelectorAll('.archive-item').forEach(card => {
                card.style.filter = '';
                card.style.opacity = '';
                card.style.pointerEvents = '';
            });
        });
    }

    // --- CANVAS WHEEL ZOOM (SCROLL ZOOM) ---
    window.addEventListener('wheel', (e) => {
        // Prevent default browser scroll behavior
        e.preventDefault();
        
        // Immediately cancel smooth transition if the user starts manually zooming
        const container = document.getElementById('world-container');
        if (container.classList.contains('smooth-transition')) {
            container.classList.remove('smooth-transition');
        }

        // Track active zooming state to pause mouse drift camera
        isZooming = true;
        clearTimeout(zoomTimeout);
        zoomTimeout = setTimeout(() => {
            isZooming = false;
        }, 800);
        
        const zoomSpeed = 0.08;
        // deltaY is positive when scrolling down (zoom out) and negative when scrolling up (zoom in)
        let newScale = zoomScale - e.deltaY * 0.0015;
        
        // Limit zoom scale between 0.15 (zoomed out far) and 2.5 (zoomed in close)
        newScale = Math.max(0.15, Math.min(newScale, 2.5));
        
        if (activeCategory) {
            zoomScale = newScale;
            // Locked zoom centered exactly on the grid middle
            panOffset.x = window.innerWidth / 2 - (WORLD_WIDTH / 2) * zoomScale;
            panOffset.y = window.innerHeight / 2 - (WORLD_HEIGHT / 2) * zoomScale;
            
            // Apply dynamic blur / opacity zoom effects
            updateCategoryZoomEffects();
        } else {
            // Standard zoom relative to the mouse cursor position (Fixed old scale mapping bug)
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            const worldX = (mouseX - panOffset.x) / zoomScale;
            const worldY = (mouseY - panOffset.y) / zoomScale;
            
            zoomScale = newScale;
            
            panOffset.x = mouseX - worldX * zoomScale;
            panOffset.y = mouseY - worldY * zoomScale;
        }
        
        updateContainerTransform();
    }, { passive: false });

    // --- BOARD DRAG PANNING ---
    window.addEventListener('mousedown', (e) => {
        if (activeCategory) {
            // Drag panning is completely locked in category views
            return;
        }
        const target = e.target;
        const isInteractive = target.closest('.archive-item') || target.closest('header') || target.closest('.category-menu') || target.closest('.detail-modal');
        
        if (!isInteractive) {
            isPanning = true;
            lastPanPos = { x: e.clientX, y: e.clientY };
            const container = document.getElementById('world-container');
            container.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (activeCategory) return; // Locked panning
        if (isPanning) {
            const dx = e.clientX - lastPanPos.x;
            const dy = e.clientY - lastPanPos.y;
            panOffset.x += dx;
            panOffset.y += dy;
            
            // Unconstrained dragging for infinite mouse navigation
            
            lastPanPos = { x: e.clientX, y: e.clientY };
            updateContainerTransform();
        }
    });

    window.addEventListener('mouseup', () => {
        isPanning = false;
        const container = document.getElementById('world-container');
        if (container) container.style.cursor = 'grab';
    });

    // Touch support for Panning & Pinch-to-Zoom
    window.addEventListener('touchstart', (e) => {
        const target = e.target;
        const isInteractive = target.closest('.archive-item') || target.closest('header') || target.closest('.category-menu') || target.closest('.detail-modal');

        if (!isInteractive) {
            if (e.touches.length === 1) {
                if (activeCategory) return; // Drag panning is completely locked in category views
                isPanning = true;
                isPinching = false;
                const touch = e.touches[0];
                lastPanPos = { x: touch.clientX, y: touch.clientY };
            } else if (e.touches.length === 2) {
                // Immediately cancel smooth transition if the user starts manually zooming
                const container = document.getElementById('world-container');
                if (container.classList.contains('smooth-transition')) {
                    container.classList.remove('smooth-transition');
                }

                isPanning = false;
                isPinching = true;
                
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                initialTouchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
                initialTouchScale = zoomScale;
                
                const midX = (t1.clientX + t2.clientX) / 2;
                const midY = (t1.clientY + t2.clientY) / 2;
                initialWorldMid = {
                    x: (midX - panOffset.x) / zoomScale,
                    y: (midY - panOffset.y) / zoomScale
                };
            }
        }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (isPanning && e.touches.length === 1) {
            if (activeCategory) return; // Locked panning
            const touch = e.touches[0];
            const dx = touch.clientX - lastPanPos.x;
            const dy = touch.clientY - lastPanPos.y;
            panOffset.x += dx;
            panOffset.y += dy;
            
            // Unconstrained touch panning for infinite navigation
            
            lastPanPos = { x: touch.clientX, y: touch.clientY };
            updateContainerTransform();
        } else if (isPinching && e.touches.length === 2) {
            // Immediately cancel smooth transition if the user starts manually zooming
            const container = document.getElementById('world-container');
            if (container.classList.contains('smooth-transition')) {
                container.classList.remove('smooth-transition');
            }

            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            
            const factor = dist / initialTouchDist;
            let newScale = initialTouchScale * factor;
            newScale = Math.max(0.15, Math.min(newScale, 2.5));
            
            zoomScale = newScale;
            
            if (activeCategory) {
                // Locked zoom centered exactly on the grid middle
                panOffset.x = window.innerWidth / 2 - (WORLD_WIDTH / 2) * zoomScale;
                panOffset.y = window.innerHeight / 2 - (WORLD_HEIGHT / 2) * zoomScale;
                
                updateCategoryZoomEffects();
            } else {
                // Standard touch zoom relative to touch midpoint
                const midX = (t1.clientX + t2.clientX) / 2;
                const midY = (t1.clientY + t2.clientY) / 2;
                
                panOffset.x = midX - initialWorldMid.x * zoomScale;
                panOffset.y = midY - initialWorldMid.y * zoomScale;
                
                // Unconstrained touch zoom panning for infinite navigation
            }
            
            updateContainerTransform();
        }
    }, { passive: true });

    window.addEventListener('touchend', () => {
        isPanning = false;
        isPinching = false;
    });

    // --- MODAL CLOSE LISTENERS ---
    const modal = document.getElementById('detail-modal');
    const modalMedia = document.getElementById('modal-media');
    
    const closeModal = () => {
        modal.classList.remove('visible');
        modalMedia.innerHTML = ''; // Stop video playback
        
        // Sync drift mouse pos on close to avoid jumps
        actualMousePos.x = realMousePos.x;
        actualMousePos.y = realMousePos.y;
        smoothMousePos.x = realMousePos.x;
        smoothMousePos.y = realMousePos.y;
    };
    
    document.getElementById('modal-close-btn').addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Escape key closes modal
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('visible')) {
            closeModal();
        }
    });

    // --- MODAL NAVIGATION LISTENERS ---
    const prevBtn = document.getElementById('modal-prev-btn');
    const nextBtn = document.getElementById('modal-next-btn');
    const footerPrevBtn = document.getElementById('modal-footer-prev-btn');
    const footerNextBtn = document.getElementById('modal-footer-next-btn');
    
    const handlePrev = (e) => {
        e.stopPropagation();
        if (currentPersonaItems.length > 1) {
            let newIndex = (currentItemIndex - 1 + currentPersonaItems.length) % currentPersonaItems.length;
            showItemAtIndex(newIndex);
        }
    };
    
    const handleNext = (e) => {
        e.stopPropagation();
        if (currentPersonaItems.length > 1) {
            let newIndex = (currentItemIndex + 1) % currentPersonaItems.length;
            showItemAtIndex(newIndex);
        }
    };
    
    if (prevBtn) prevBtn.addEventListener('click', handlePrev);
    if (nextBtn) nextBtn.addEventListener('click', handleNext);
    if (footerPrevBtn) footerPrevBtn.addEventListener('click', handlePrev);
    if (footerNextBtn) footerNextBtn.addEventListener('click', handleNext);
    
    // Keyboard navigation
    window.addEventListener('keydown', (e) => {
        if (modal.classList.contains('visible') && currentPersonaItems.length > 1) {
            if (e.key === 'ArrowLeft') {
                let newIndex = (currentItemIndex - 1 + currentPersonaItems.length) % currentPersonaItems.length;
                showItemAtIndex(newIndex);
            } else if (e.key === 'ArrowRight') {
                let newIndex = (currentItemIndex + 1) % currentPersonaItems.length;
                showItemAtIndex(newIndex);
            }
        }
    });

    // --- FLOATING ZOOM BUTTON LISTENERS ---
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    
    const handleZoomButton = (zoomIn) => {
        const factor = zoomIn ? 1.25 : 1 / 1.25;
        let newScale = zoomScale * factor;
        newScale = Math.max(0.15, Math.min(newScale, 2.5));
        
        isZooming = true;
        clearTimeout(zoomTimeout);
        zoomTimeout = setTimeout(() => {
            isZooming = false;
        }, 800);
        
        const container = document.getElementById('world-container');
        if (container.classList.contains('smooth-transition')) {
            container.classList.remove('smooth-transition');
        }
        
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        
        if (activeCategory) {
            zoomScale = newScale;
            panOffset.x = centerX - (WORLD_WIDTH / 2) * zoomScale;
            panOffset.y = centerY - (WORLD_HEIGHT / 2) * zoomScale;
            updateCategoryZoomEffects();
        } else {
            const worldX = (centerX - panOffset.x) / zoomScale;
            const worldY = (centerY - panOffset.y) / zoomScale;
            zoomScale = newScale;
            panOffset.x = centerX - worldX * zoomScale;
            panOffset.y = centerY - worldY * zoomScale;
        }
        updateContainerTransform();
    };
    
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => handleZoomButton(true));
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => handleZoomButton(false));
}

// --- MOUSE DRIFT WANDERING CAMERA NAVIGATION ---
let actualMousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let smoothMousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let realMousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
window.addEventListener('mousemove', (e) => {
    realMousePos.x = e.clientX;
    realMousePos.y = e.clientY;
});
let isTouchActive = false;

// Track touch states to disable mouse drift on mobile devices
window.addEventListener('touchstart', () => {
    isTouchActive = true;
}, { passive: true });

window.addEventListener('touchend', () => {
    isTouchActive = false;
});

window.addEventListener('touchcancel', () => {
    isTouchActive = false;
});

// Track mouse position on desktop to drive camera drift
window.addEventListener('mousemove', (e) => {
    if (activeCategory) return; // Locked in category view
    
    // Disable drift if detail modal is open
    const modal = document.getElementById('detail-modal');
    if (modal && modal.classList.contains('visible')) return;
    
    actualMousePos.x = e.clientX;
    actualMousePos.y = e.clientY;
});

// Animation loop to smoothly drift the camera following the mouse
function runDriftLoop() {
    requestAnimationFrame(runDriftLoop);
    
    if (activeCategory) return; // Locked zoom-only in category view
    if (isTouchActive) return; // Allow manual dragging on touch devices
    if (isPanning) return; // Pause drift while user is click-dragging
    if (isZooming) return; // Pause drift while user is scroll-zooming
    
    const modal = document.getElementById('detail-modal');
    if (modal && modal.classList.contains('visible')) return;
    
    // Double-smoothed mouse coords for cinematic slow float
    smoothMousePos.x += (actualMousePos.x - smoothMousePos.x) * 0.04;
    smoothMousePos.y += (actualMousePos.y - smoothMousePos.y) * 0.04;
    
    const rx = smoothMousePos.x / window.innerWidth;
    const ry = smoothMousePos.y / window.innerHeight;
    
    // Map mouse position to cover the entire board bounds smoothly
    const rangeX = WORLD_WIDTH * zoomScale - window.innerWidth;
    const targetX = rangeX > 0 ? -(rx * rangeX) : (window.innerWidth / 2 - (WORLD_WIDTH * zoomScale) / 2);
    
    const rangeY = WORLD_HEIGHT * zoomScale - window.innerHeight;
    const targetY = rangeY > 0 ? -(ry * rangeY) : (window.innerHeight / 2 - (WORLD_HEIGHT * zoomScale) / 2);
    
    // Smooth floaty lerp (0.002 multiplier for a much slower and elegant drift)
    panOffset.x += (targetX - panOffset.x) * 0.002;
    panOffset.y += (targetY - panOffset.y) * 0.002;
    
    updateContainerTransform();
}
// Start drift loop automatically
runDriftLoop();


// --- MULTILINGUAL HEBREW/ENGLISH DICTIONARIES & LOGIC ---
const CATEGORIES_LANG = {
    motherhood: { he: "הריון לידה ואימהות", en: "Pregnancy & Motherhood" },
    relationships: { he: "זוגיות ופרידות", en: "Relationships & Breakups" },
    appearance: { he: "משקל ונראות", en: "Weight & Appearance" },
    mental_health: { he: "בריאות הנפש", en: "Mental Health" },
    career: { he: "קריירה ושליטה בנרטיב", en: "Career & Narrative" },
    scandals: { he: "שערוריות ופליטות פה", en: "Scandals & Outbursts" }
};

// Set up language toggle switch button listener
function setupLanguageSwitch() {
    const btn = document.getElementById("lang-toggle-btn");
    if (btn) {
        btn.addEventListener("click", () => {
            currentLang = currentLang === "he" ? "en" : "he";
            
            // Update document direction attribute
            document.body.setAttribute("dir", currentLang === "he" ? "rtl" : "ltr");
            
            updateLanguageUI();
        });
    }
    
    // Initialize UI elements in default language
    updateLanguageUI();
}

// Update all UI elements dynamically in selected language
function updateLanguageUI() {
    // 1. Update language toggle button text
    const btn = document.getElementById("lang-toggle-btn");
    if (btn) {
        btn.textContent = currentLang === "he" ? "EN" : "עב";
    }

    // 2. Update bottom category pills texts
    const pills = document.querySelectorAll(".category-pill");
    pills.forEach(pill => {
        const cat = pill.getAttribute("data-category");
        if (CATEGORIES_LANG[cat]) {
            pill.textContent = currentLang === "he" ? CATEGORIES_LANG[cat].he : CATEGORIES_LANG[cat].en;
        }
    });

    // 3. Update category menu layout flow
    const categoryMenu = document.getElementById("category-menu");
    if (categoryMenu) {
        categoryMenu.style.direction = currentLang === "he" ? "rtl" : "ltr";
    }

    // 4. Update detail modal layout text direction
    const modalContent = document.querySelector(".modal-content");
    const modalFooterNav = document.querySelector(".modal-footer-nav");
    if (modalContent) {
        modalContent.style.direction = currentLang === "he" ? "rtl" : "ltr";
        modalContent.style.textAlign = currentLang === "he" ? "right" : "left";
    }
    if (modalFooterNav) {
        modalFooterNav.style.direction = currentLang === "he" ? "rtl" : "ltr";
    }

    // 5. Update open modal contents if visible
    const modal = document.getElementById("detail-modal");
    if (modal && modal.classList.contains("visible") && currentItemIndex >= 0) {
        showItemAtIndex(currentItemIndex);
    }

    // 6. Update board persona name watermarks
    const groups = document.querySelectorAll(".persona-group");
    groups.forEach(group => {
        const key = group.getAttribute("data-persona");
        const itemMatches = ARCHIVE_DATA.filter(item => item.personaKey === key);
        if (itemMatches.length > 0) {
            const nameText = currentLang === "en" ? (itemMatches[0].personaEn || itemMatches[0].persona) : itemMatches[0].persona;
            const nameDiv = group.querySelector(".persona-name");
            if (nameDiv) {
                nameDiv.textContent = nameText;
                nameDiv.style.direction = currentLang === "he" ? "rtl" : "ltr";
            }
            
            const labelOnRight = (key.charCodeAt(0) % 2 === 0);
            group.style.textAlign = labelOnRight ? "left" : "right";
            group.style.alignItems = labelOnRight ? "flex-start" : "flex-end";
            group.style.transform = labelOnRight ? "translate3d(0, -50%, 0) scale(1)" : "translate3d(-100%, -50%, 0) scale(1)";
        }
    });
}
