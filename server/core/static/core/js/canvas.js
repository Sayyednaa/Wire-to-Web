let pageCount = 1;
let activePageId = 1;
let selectedElement = null;

// Page dimensions in px (corresponds to A4 aspect ratio in style.css)
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;

let currentScale = 1;

function updateCanvasScale() {
    const viewport = document.getElementById("canvas-viewport-area");
    if (!viewport) return;
    
    const viewportWidth = viewport.clientWidth;
    const padding = window.innerWidth >= 1024 ? 80 : 32;
    const availableWidth = viewportWidth - padding;
    
    if (availableWidth < PAGE_WIDTH) {
        currentScale = availableWidth / PAGE_WIDTH;
    } else {
        currentScale = 1;
    }
    
    document.querySelectorAll(".a4-page-scale-container").forEach(container => {
        container.style.width = `${PAGE_WIDTH * currentScale}px`;
        container.style.height = `${PAGE_HEIGHT * currentScale}px`;
        
        const page = container.querySelector(".a4-canvas-page");
        if (page) {
            page.style.transform = `scale(${currentScale})`;
            page.style.transformOrigin = "top left";
        }
    });
}

// --- Initialize DOM Event Listeners ---

document.addEventListener("DOMContentLoaded", () => {
    // Initial page event listener
    setupPageEvents(document.getElementById("page-1"));
    
    // Initialize scaling and listen for window resize
    updateCanvasScale();
    window.addEventListener("resize", updateCanvasScale);

    // Check if there is a pending image from the dashboard redirect
    const pendingImage = sessionStorage.getItem("pending_canvas_image");
    if (pendingImage) {
        createImageElement(pendingImage);
        sessionStorage.removeItem("pending_canvas_image");
    }
});

// --- Page Management ---

function setupPageEvents(page) {
    page.addEventListener("click", (e) => {
        const pageNum = parseInt(page.id.replace("page-", ""));
        setActivePage(pageNum, e);
    });
}

function setActivePage(pageNum, event) {
    if (event) {
        event.stopPropagation(); // Avoid triggering deselectAllElements
    }
    activePageId = pageNum;
    
    // Highlight page border
    document.querySelectorAll(".a4-canvas-page").forEach(p => {
        p.classList.remove("active-page-border");
    });
    const activePage = document.getElementById(`page-${pageNum}`);
    if (activePage) {
        activePage.classList.add("active-page-border");
    }
}

function addNewPage() {
    pageCount++;
    activePageId = pageCount;
    
    const viewport = document.getElementById("canvas-viewport-area");
    
    const container = document.createElement("div");
    container.className = "a4-page-scale-container";
    container.style.width = `${PAGE_WIDTH * currentScale}px`;
    container.style.height = `${PAGE_HEIGHT * currentScale}px`;
    container.style.overflow = "visible";
    
    const newPage = document.createElement("div");
    newPage.className = "a4-canvas-page active-page-border";
    newPage.id = `page-${pageCount}`;
    newPage.style.transform = `scale(${currentScale})`;
    newPage.style.transformOrigin = "top left";
    
    // Page counter badge
    const badge = document.createElement("div");
    badge.className = "page-badge-counter";
    badge.textContent = `Page ${pageCount}`;
    newPage.appendChild(badge);
    
    // Delete page button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "page-delete-btn";
    deleteBtn.innerHTML = "&times;";
    deleteBtn.title = "Delete this page";
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        deletePage(newPage.id);
    };
    newPage.appendChild(deleteBtn);
    
    container.appendChild(newPage);
    viewport.appendChild(container);
    
    setupPageEvents(newPage);
    setActivePage(pageCount);
    
    // Scroll viewport to the new page
    viewport.scrollTo({
        top: container.offsetTop - 40,
        behavior: 'smooth'
    });
}

function deletePage(pageId) {
    if (confirm("Are you sure you want to delete this page? All elements on this page will be lost.")) {
        const page = document.getElementById(pageId);
        if (page) {
            const container = page.closest(".a4-page-scale-container");
            if (container) {
                container.remove();
            } else {
                page.remove();
            }
            reindexPages();
        }
    }
}

function reindexPages() {
    const pages = document.querySelectorAll(".a4-canvas-page");
    pageCount = pages.length;
    
    pages.forEach((page, index) => {
        const newNum = index + 1;
        page.id = `page-${newNum}`;
        
        // Update badge
        const badge = page.querySelector(".page-badge-counter");
        if (badge) {
            badge.textContent = `Page ${newNum}`;
        }
        
        // Update delete button click behavior
        const deleteBtn = page.querySelector(".page-delete-btn");
        if (deleteBtn) {
            // Re-bind delete click
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                deletePage(page.id);
            };
        }
    });
    
    // Set active page to first page if active page was deleted
    if (activePageId > pageCount) {
        setActivePage(1);
    } else {
        setActivePage(activePageId);
    }
}

// --- Element Selection & Deselection ---

function selectElement(element, event) {
    if (event) {
        event.stopPropagation(); // Prevent deselectAllElements
    }
    
    deselectAllElements();
    selectedElement = element;
    selectedElement.classList.add("selected");

    // Show Crop Image button if selected element contains an image
    const cropBtn = document.getElementById("crop-btn");
    if (cropBtn) {
        if (selectedElement.querySelector("img")) {
            cropBtn.style.display = "block";
        } else {
            cropBtn.style.display = "none";
        }
    }
}

function deselectAllElements(event) {
    // Only deselect if user clicked on viewport background or canvas border,
    // not when clicking active inputs or resizing handles.
    if (event && (event.target.closest('.canvas-element') || event.target.closest('.canvas-sidebar'))) {
        return;
    }
    
    // Exit crop mode if active when deselecting
    if (isCropMode) {
        toggleCropMode();
    }
    
    if (selectedElement) {
        selectedElement.classList.remove("selected");
        selectedElement = null;
    }

    const cropBtn = document.getElementById("crop-btn");
    if (cropBtn) {
        cropBtn.style.display = "none";
    }
}

function deleteSelectedElement() {
    if (selectedElement) {
        selectedElement.remove();
        selectedElement = null;
    } else {
        alert("Please select an element on the canvas first.");
    }
}

function adjustZIndex(direction) {
    if (!selectedElement) {
        alert("Please select an element on the canvas first.");
        return;
    }
    const parent = selectedElement.parentNode;
    if (!parent) return;

    // Get all canvas elements on this page in DOM order
    const elements = Array.from(parent.querySelectorAll(".canvas-element"));
    const index = elements.indexOf(selectedElement);
    if (index === -1) return;

    if (direction > 0) {
        // Bring Forward: swap with the next canvas element
        if (index < elements.length - 1) {
            const nextEl = elements[index + 1];
            // To place selectedElement after nextEl, we insert it before nextEl.nextSibling
            parent.insertBefore(selectedElement, nextEl.nextSibling);
            console.log("[*] Moved element one layer Forward");
        } else {
            console.log("[*] Element is already at the top layer");
        }
    } else {
        // Send Backward: swap with the previous canvas element
        if (index > 0) {
            const prevEl = elements[index - 1];
            // To place selectedElement before prevEl, we insert it before prevEl
            parent.insertBefore(selectedElement, prevEl);
            console.log("[*] Moved element one layer Backward");
        } else {
            console.log("[*] Element is already at the bottom layer");
        }
    }
}

// --- TextBox Element ---

function addTextBox() {
    const activePage = document.getElementById(`page-${activePageId}`);
    if (!activePage) return;
    
    const wrapper = document.createElement("div");
    wrapper.className = "canvas-element";
    wrapper.style.left = "100px";
    wrapper.style.top = "100px";
    wrapper.style.width = "200px";
    wrapper.style.height = "100px";
    wrapper.style.zIndex = "1";
    
    const textDiv = document.createElement("div");
    textDiv.className = "text-content";
    textDiv.contentEditable = "true";
    textDiv.innerHTML = "Click to type text...";
    
    wrapper.appendChild(textDiv);
    addResizeHandles(wrapper);
    
    activePage.appendChild(wrapper);
    setupElementDragAndResize(wrapper);
    selectElement(wrapper);
    
    // Focus the editable text block
    setTimeout(() => textDiv.focus(), 50);
}

// --- Image Element ---

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        createImageElement(e.target.result);
    };
    reader.readAsDataURL(file);
    
    // Reset file input value so same file can be uploaded again
    event.target.value = "";
}

function createImageElement(src) {
    const activePage = document.getElementById(`page-${activePageId}`);
    if (!activePage) return;
    
    const wrapper = document.createElement("div");
    wrapper.className = "canvas-element";
    wrapper.style.left = "100px";
    wrapper.style.top = "100px";
    wrapper.style.width = "250px";
    wrapper.style.height = "250px";
    wrapper.style.zIndex = "1";
    wrapper.style.overflow = "hidden"; // Enables cropping masking
    
    const img = document.createElement("img");
    img.src = src;
    img.style.position = "absolute";
    img.style.left = "0px";
    img.style.top = "0px";
    
    // Auto-adjust scale once image loads to maintain aspect ratio
    img.onload = () => {
        const ratio = img.naturalWidth / img.naturalHeight;
        if (ratio > 1) {
            wrapper.style.height = `${250 / ratio}px`;
            img.style.width = "100%";
            img.style.height = "100%";
        } else {
            wrapper.style.width = `${250 * ratio}px`;
            img.style.width = "100%";
            img.style.height = "100%";
        }
    };
    
    wrapper.appendChild(img);
    addResizeHandles(wrapper);
    
    activePage.appendChild(wrapper);
    setupElementDragAndResize(wrapper);
    selectElement(wrapper);
}

// --- Drag and Resize Engine ---

function getEventCoords(e) {
    if (e.touches && e.touches.length > 0) {
        return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
    }
    if (e.changedTouches && e.changedTouches.length > 0) {
        return { clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY };
    }
    return { clientX: e.clientX, clientY: e.clientY };
}

function addResizeHandles(el) {
    const positions = ["nw", "ne", "sw", "se", "n", "s", "e", "w"];
    positions.forEach(pos => {
        const handle = document.createElement("div");
        handle.className = `resize-handle handle-${pos}`;
        handle.dataset.handle = pos;
        el.appendChild(handle);
    });
}

let isCropMode = false;

function toggleCropMode() {
    if (!selectedElement) return;
    const img = selectedElement.querySelector("img");
    if (!img) return;

    const cropBtn = document.getElementById("crop-btn");

    if (!isCropMode) {
        // Enter Crop Mode
        isCropMode = true;
        selectedElement.classList.add("cropping");
        selectedElement.style.overflow = "visible";
        img.style.opacity = "0.5";
        if (cropBtn) {
            cropBtn.textContent = "Finish Cropping";
            cropBtn.classList.remove("btn-secondary");
            cropBtn.classList.add("btn-primary");
        }

        // Lock image sizes in absolute pixels so they don't stretch
        const imgStartWidth = img.offsetWidth;
        const imgStartHeight = img.offsetHeight;
        img.style.width = `${imgStartWidth}px`;
        img.style.height = `${imgStartHeight}px`;
        if (!img.style.left) img.style.left = "0px";
        if (!img.style.top) img.style.top = "0px";

        // Create Crop Box Overlay
        const cropBox = document.createElement("div");
        cropBox.className = "crop-box-overlay";
        cropBox.style.position = "absolute";
        cropBox.style.left = "0px";
        cropBox.style.top = "0px";
        cropBox.style.width = `${selectedElement.offsetWidth}px`;
        cropBox.style.height = `${selectedElement.offsetHeight}px`;
        cropBox.style.border = "2px dashed var(--color-brand-pink)";
        cropBox.style.boxSizing = "border-box";
        cropBox.style.cursor = "move";
        cropBox.style.zIndex = "100";

        // Add 8 handles to the crop box
        const positions = ["nw", "ne", "sw", "se", "n", "s", "e", "w"];
        positions.forEach(pos => {
            const handle = document.createElement("div");
            handle.className = `crop-handle crop-handle-${pos}`;
            handle.dataset.handle = pos;
            
            // Positioning coordinates and cursor
            handle.style.position = "absolute";
            handle.style.width = "10px";
            handle.style.height = "10px";
            handle.style.backgroundColor = "var(--color-brand-pink)";
            handle.style.border = "1px solid white";
            handle.style.borderRadius = "50%";
            handle.style.zIndex = "101";
            
            if (pos === "nw") { handle.style.top = "-5px"; handle.style.left = "-5px"; handle.style.cursor = "nwse-resize"; }
            else if (pos === "ne") { handle.style.top = "-5px"; handle.style.right = "-5px"; handle.style.cursor = "nesw-resize"; }
            else if (pos === "sw") { handle.style.bottom = "-5px"; handle.style.left = "-5px"; handle.style.cursor = "nesw-resize"; }
            else if (pos === "se") { handle.style.bottom = "-5px"; handle.style.right = "-5px"; handle.style.cursor = "nwse-resize"; }
            else if (pos === "n") { handle.style.top = "-5px"; handle.style.left = "calc(50% - 5px)"; handle.style.cursor = "ns-resize"; }
            else if (pos === "s") { handle.style.bottom = "-5px"; handle.style.left = "calc(50% - 5px)"; handle.style.cursor = "ns-resize"; }
            else if (pos === "e") { handle.style.top = "calc(50% - 5px)"; handle.style.right = "-5px"; handle.style.cursor = "ew-resize"; }
            else if (pos === "w") { handle.style.top = "calc(50% - 5px)"; handle.style.left = "-5px"; handle.style.cursor = "ew-resize"; }
            
            cropBox.appendChild(handle);
        });

        // Add dragging to crop box
        const startCropBoxDrag = (e) => {
            if (e.target.classList.contains("crop-handle")) return;
            e.stopPropagation();
            if (e.cancelable) {
                e.preventDefault();
            }

            const imgL = parseFloat(img.style.left) || 0;
            const imgT = parseFloat(img.style.top) || 0;
            const imgW = img.offsetWidth;
            const imgH = img.offsetHeight;

            const coords = getEventCoords(e);
            const startX = coords.clientX;
            const startY = coords.clientY;
            const startCbLeft = parseFloat(cropBox.style.left) || 0;
            const startCbTop = parseFloat(cropBox.style.top) || 0;
            const cbW = cropBox.offsetWidth;
            const cbH = cropBox.offsetHeight;

            function onCropBoxMove(moveEvent) {
                if (moveEvent.cancelable) {
                    moveEvent.preventDefault();
                }

                const moveCoords = getEventCoords(moveEvent);
                const dx = (moveCoords.clientX - startX) / currentScale;
                const dy = (moveCoords.clientY - startY) / currentScale;

                let newCbLeft = startCbLeft + dx;
                let newCbTop = startCbTop + dy;

                // Constrain crop box to stay inside image bounds
                newCbLeft = Math.max(imgL, Math.min(imgL + imgW - cbW, newCbLeft));
                newCbTop = Math.max(imgT, Math.min(imgT + imgH - cbH, newCbTop));

                cropBox.style.left = `${newCbLeft}px`;
                cropBox.style.top = `${newCbTop}px`;
            }

            function onCropBoxUp() {
                window.removeEventListener("mousemove", onCropBoxMove);
                window.removeEventListener("touchmove", onCropBoxMove);
                window.removeEventListener("mouseup", onCropBoxUp);
                window.removeEventListener("touchend", onCropBoxUp);
            }

            window.addEventListener("mousemove", onCropBoxMove);
            window.addEventListener("touchmove", onCropBoxMove, { passive: false });
            window.addEventListener("mouseup", onCropBoxUp);
            window.addEventListener("touchend", onCropBoxUp);
        };

        cropBox.addEventListener("mousedown", startCropBoxDrag);
        cropBox.addEventListener("touchstart", startCropBoxDrag, { passive: false });

        // Add resizing to crop handles
        cropBox.querySelectorAll(".crop-handle").forEach(handle => {
            const startCropHandleResize = (e) => {
                e.stopPropagation();
                if (e.cancelable) {
                    e.preventDefault();
                }

                const pos = handle.dataset.handle;
                const imgL = parseFloat(img.style.left) || 0;
                const imgT = parseFloat(img.style.top) || 0;
                const imgW = img.offsetWidth;
                const imgH = img.offsetHeight;

                const coords = getEventCoords(e);
                const startX = coords.clientX;
                const startY = coords.clientY;
                const startCbLeft = parseFloat(cropBox.style.left) || 0;
                const startCbTop = parseFloat(cropBox.style.top) || 0;
                const startCbWidth = cropBox.offsetWidth;
                const startCbHeight = cropBox.offsetHeight;

                function onCropHandleMove(moveEvent) {
                    if (moveEvent.cancelable) {
                        moveEvent.preventDefault();
                    }

                    const moveCoords = getEventCoords(moveEvent);
                    const dx = (moveCoords.clientX - startX) / currentScale;
                    const dy = (moveCoords.clientY - startY) / currentScale;

                    let newCbLeft = startCbLeft;
                    let newCbTop = startCbTop;
                    let newCbWidth = startCbWidth;
                    let newCbHeight = startCbHeight;

                    if (pos.includes("e")) {
                        newCbWidth = startCbWidth + dx;
                    }
                    if (pos.includes("w")) {
                        newCbWidth = startCbWidth - dx;
                        newCbLeft = startCbLeft + dx;
                    }
                    if (pos.includes("s")) {
                        newCbHeight = startCbHeight + dy;
                    }
                    if (pos.includes("n")) {
                        newCbHeight = startCbHeight - dy;
                        newCbTop = startCbTop + dy;
                    }

                    // Min size constraints
                    const minSize = 20;
                    if (newCbWidth < minSize) {
                        newCbWidth = minSize;
                        if (pos.includes("w")) {
                            newCbLeft = startCbLeft + startCbWidth - minSize;
                        }
                    }
                    if (newCbHeight < minSize) {
                        newCbHeight = minSize;
                        if (pos.includes("n")) {
                            newCbTop = startCbTop + startCbHeight - minSize;
                        }
                    }

                    // Constrain within image bounds
                    if (newCbLeft < imgL) {
                        newCbWidth += (newCbLeft - imgL);
                        newCbLeft = imgL;
                    }
                    if (newCbTop < imgT) {
                        newCbHeight += (newCbTop - imgT);
                        newCbTop = imgT;
                    }
                    if (newCbLeft + newCbWidth > imgL + imgW) {
                        newCbWidth = imgL + imgW - newCbLeft;
                    }
                    if (newCbTop + newCbHeight > imgT + imgH) {
                        newCbHeight = imgT + imgH - newCbTop;
                    }

                    cropBox.style.left = `${newCbLeft}px`;
                    cropBox.style.top = `${newCbTop}px`;
                    cropBox.style.width = `${newCbWidth}px`;
                    cropBox.style.height = `${newCbHeight}px`;
                }

                function onCropHandleUp() {
                    window.removeEventListener("mousemove", onCropHandleMove);
                    window.removeEventListener("touchmove", onCropHandleMove);
                    window.removeEventListener("mouseup", onCropHandleUp);
                    window.removeEventListener("touchend", onCropHandleUp);
                }

                window.addEventListener("mousemove", onCropHandleMove);
                window.addEventListener("touchmove", onCropHandleMove, { passive: false });
                window.addEventListener("mouseup", onCropHandleUp);
                window.addEventListener("touchend", onCropHandleUp);
            };

            handle.addEventListener("mousedown", startCropHandleResize);
            handle.addEventListener("touchstart", startCropHandleResize, { passive: false });
        });

        selectedElement.appendChild(cropBox);
        console.log("[*] Entered Image Crop Mode with Visual Overlay");
    } else {
        // Exit Crop Mode
        isCropMode = false;
        selectedElement.classList.remove("cropping");
        selectedElement.style.overflow = "hidden";
        img.style.opacity = "1";

        const cropBox = selectedElement.querySelector(".crop-box-overlay");
        if (cropBox) {
            const cbLeft = parseFloat(cropBox.style.left) || 0;
            const cbTop = parseFloat(cropBox.style.top) || 0;
            const cbWidth = cropBox.offsetWidth;
            const cbHeight = cropBox.offsetHeight;

            // Apply new container coordinates
            const elLeft = parseFloat(selectedElement.style.left) || 0;
            const elTop = parseFloat(selectedElement.style.top) || 0;

            selectedElement.style.left = `${elLeft + cbLeft}px`;
            selectedElement.style.top = `${elTop + cbTop}px`;
            selectedElement.style.width = `${cbWidth}px`;
            selectedElement.style.height = `${cbHeight}px`;

            // Adjust image position offsets inside container to match new clip
            const imgLeft = parseFloat(img.style.left) || 0;
            const imgTop = parseFloat(img.style.top) || 0;

            img.style.left = `${imgLeft - cbLeft}px`;
            img.style.top = `${imgTop - cbTop}px`;

            cropBox.remove();
        }

        if (cropBtn) {
            cropBtn.textContent = "Crop Image";
            cropBtn.classList.remove("btn-primary");
            cropBtn.classList.add("btn-secondary");
        }
        console.log("[*] Exited Image Crop Mode");
    }
}

function setupElementDragAndResize(el) {
    const startDrag = (e) => {
        // Stop drag if clicking inside text-content to type, or clicking handles
        if (e.target.classList.contains("text-content") && document.activeElement === e.target) {
            return;
        }
        if (e.target.classList.contains("resize-handle")) {
            return;
        }
        
        // If Crop Mode is active, disable dragging the element wrapper
        if (isCropMode) {
            return;
        }

        selectElement(el, e);
        
        const coords = getEventCoords(e);
        let startX = coords.clientX;
        let startY = coords.clientY;
        let startLeft = parseInt(el.style.left) || 0;
        let startTop = parseInt(el.style.top) || 0;
        
        function onMouseMove(moveEvent) {
            if (moveEvent.cancelable) {
                moveEvent.preventDefault();
            }

            const moveCoords = getEventCoords(moveEvent);
            let dx = (moveCoords.clientX - startX) / currentScale;
            let dy = (moveCoords.clientY - startY) / currentScale;
            
            let newLeft = startLeft + dx;
            let newTop = startTop + dy;
            
            // Boundary constraints inside the A4 canvas bounds
            const elWidth = el.offsetWidth;
            const elHeight = el.offsetHeight;
            
            newLeft = Math.max(0, Math.min(PAGE_WIDTH - elWidth, newLeft));
            newTop = Math.max(0, Math.min(PAGE_HEIGHT - elHeight, newTop));
            
            el.style.left = `${newLeft}px`;
            el.style.top = `${newTop}px`;
        }
        
        function onMouseUp() {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("touchmove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            window.removeEventListener("touchend", onMouseUp);
        }
        
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("touchmove", onMouseMove, { passive: false });
        window.addEventListener("mouseup", onMouseUp);
        window.addEventListener("touchend", onMouseUp);
    };

    el.addEventListener("mousedown", startDrag);
    el.addEventListener("touchstart", startDrag, { passive: false });
    
    // Setup handle dragging for resizing
    el.querySelectorAll(".resize-handle").forEach(handle => {
        const startResize = (e) => {
            e.stopPropagation();
            if (e.cancelable) {
                e.preventDefault();
            }
            
            if (isCropMode) {
                return;
            }
            
            const position = handle.dataset.handle;
            const img = el.querySelector("img");
            
            const coords = getEventCoords(e);
            let startX = coords.clientX;
            let startY = coords.clientY;
            let startLeft = parseInt(el.style.left) || 0;
            let startTop = parseInt(el.style.top) || 0;
            let startWidth = el.offsetWidth;
            let startHeight = el.offsetHeight;
            
            let imgStartWidth, imgStartHeight, imgStartLeft, imgStartTop;
            if (img) {
                const styleWidth = img.style.width;
                const styleHeight = img.style.height;
                imgStartWidth = (styleWidth && styleWidth.endsWith("px")) ? parseFloat(styleWidth) : img.offsetWidth;
                imgStartHeight = (styleHeight && styleHeight.endsWith("px")) ? parseFloat(styleHeight) : img.offsetHeight;
                imgStartLeft = parseFloat(img.style.left) || 0;
                imgStartTop = parseFloat(img.style.top) || 0;
            }
            
            function onMouseMove(moveEvent) {
                if (moveEvent.cancelable) {
                    moveEvent.preventDefault();
                }

                const moveCoords = getEventCoords(moveEvent);
                let dx = (moveCoords.clientX - startX) / currentScale;
                let dy = (moveCoords.clientY - startY) / currentScale;
                
                let newLeft = startLeft;
                let newTop = startTop;
                let newWidth = startWidth;
                let newHeight = startHeight;
                
                // Resizing logic per handle direction
                if (position.includes("e")) {
                    newWidth = startWidth + dx;
                }
                if (position.includes("w")) {
                    newWidth = startWidth - dx;
                    newLeft = startLeft + dx;
                }
                if (position.includes("s")) {
                    newHeight = startHeight + dy;
                }
                if (position.includes("n")) {
                    newHeight = startHeight - dy;
                    newTop = startTop + dy;
                }
                
                // Min dimension limits
                const minDim = 20;
                if (newWidth < minDim) {
                    newWidth = minDim;
                    if (position.includes("w")) {
                        newLeft = startLeft + startWidth - minDim;
                    }
                }
                if (newHeight < minDim) {
                    newHeight = minDim;
                    if (position.includes("n")) {
                        newTop = startTop + startHeight - minDim;
                    }
                }
                
                // Page Boundary restrictions
                if (newLeft < 0) {
                    newWidth += newLeft;
                    newLeft = 0;
                }
                if (newTop < 0) {
                    newHeight += newTop;
                    newTop = 0;
                }
                if (newLeft + newWidth > PAGE_WIDTH) {
                    newWidth = PAGE_WIDTH - newLeft;
                }
                if (newTop + newHeight > PAGE_HEIGHT) {
                    newHeight = PAGE_HEIGHT - newTop;
                }
                
                // Scale the image proportionally inside the container
                if (img) {
                    const scaleX = newWidth / startWidth;
                    const scaleY = newHeight / startHeight;
                    img.style.width = `${imgStartWidth * scaleX}px`;
                    img.style.height = `${imgStartHeight * scaleY}px`;
                    img.style.left = `${imgStartLeft * scaleX}px`;
                    img.style.top = `${imgStartTop * scaleY}px`;
                }

                el.style.left = `${newLeft}px`;
                el.style.top = `${newTop}px`;
                el.style.width = `${newWidth}px`;
                el.style.height = `${newHeight}px`;
            }
            
            function onMouseUp() {
                window.removeEventListener("mousemove", onMouseMove);
                window.removeEventListener("touchmove", onMouseMove);
                window.removeEventListener("mouseup", onMouseUp);
                window.removeEventListener("touchend", onMouseUp);
            }
            
            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("touchmove", onMouseMove, { passive: false });
            window.addEventListener("mouseup", onMouseUp);
            window.addEventListener("touchend", onMouseUp);
        };
        
        handle.addEventListener("mousedown", startResize);
        handle.addEventListener("touchstart", startResize, { passive: false });
    });
}

// --- PDF Compilation & Multi-Page Submission ---

async function submitCanvasJob(event) {
    event.preventDefault();
    
    const printerId = document.getElementById("printer-select").value;
    if (!printerId) {
        alert("Please select a printer first.");
        return;
    }
    
    // Show spinner overlay
    const overlay = document.getElementById("print-status-overlay");
    const printBtn = document.getElementById("print-canvas-btn");
    overlay.style.display = "block";
    printBtn.disabled = true;
    
    // Deselect any active elements to hide outlines/borders
    deselectAllElements();
    
    try {
        const { jsPDF } = window.jspdf;
        
        // A4 page size in points: 595.28 x 841.89
        const pdf = new jsPDF({
            orientation: "portrait",
            unit: "pt",
            format: "a4"
        });
        
        const pages = document.querySelectorAll(".a4-canvas-page");
        
        for (let i = 0; i < pages.length; i++) {
            const pageEl = pages[i];
            const pageNum = i + 1;
            
            document.getElementById("status-progress-text").textContent = `Compiling page ${pageNum} of ${pages.length}...`;
            
            // Hide delete buttons and counters temporarily
            const badges = pageEl.querySelectorAll(".page-badge-counter, .page-delete-btn");
            badges.forEach(b => b.style.display = "none");
            
            // Temporarily reset transform for clean screenshot
            const origTransform = pageEl.style.transform;
            pageEl.style.transform = "none";
            
            // Render HTML element to canvas
            const canvas = await html2canvas(pageEl, {
                scale: 2, // High resolution screenshot multiplier
                useCORS: true,
                backgroundColor: "#ffffff"
            });
            
            // Restore transform and badges
            pageEl.style.transform = origTransform;
            badges.forEach(b => b.style.display = "");
            
            const imgData = canvas.toDataURL("image/jpeg", 0.95);
            
            if (i > 0) {
                pdf.addPage();
            }
            
            pdf.addImage(imgData, "JPEG", 0, 0, 595.28, 841.89);
        }
        
        document.getElementById("status-progress-text").textContent = "Uploading PDF to server...";
        const pdfBlob = pdf.output("blob");
        
        // Build FormData payload
        const formData = new FormData();
        formData.append("file", pdfBlob, "canvas_printout.pdf");
        formData.append("printer", printerId);
        formData.append("copies", document.getElementById("copies-count").value);
        formData.append("paper_size", document.getElementById("paper-size-select").value);
        formData.append("orientation", document.getElementById("orientation-select") ? document.getElementById("orientation-select").value : "PORTRAIT");
        formData.append("color_mode", document.getElementById("color-mode-select").value);
        formData.append("duplex", document.getElementById("duplex-select").value);
        formData.append("quality", document.getElementById("quality-select").value);
        
        // POST to Django backend API
        const response = await fetch("/canvas/print/", {
            method: "POST",
            body: formData,
            headers: {
                // CSRF middleware token verification header (if needed, but views.py uses @csrf_exempt for easy API endpoints)
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            document.getElementById("status-spinner-text").textContent = "Success!";
            document.getElementById("status-progress-text").textContent = "Redirecting to queue...";
            
            setTimeout(() => {
                window.location.href = result.redirect_url;
            }, 1000);
        } else {
            const errorData = await response.json();
            alert(`Printing failed: ${errorData.error || 'Server error'}`);
            printBtn.disabled = false;
            overlay.style.display = "none";
        }
        
    } catch (err) {
        console.error("PDF compiling pipeline error:", err);
        alert(`Error rendering canvas layout: ${err.message}`);
        printBtn.disabled = false;
        overlay.style.display = "none";
    }
}
