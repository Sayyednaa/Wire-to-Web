let pageCount = 1;
let activePageId = 1;
let selectedElement = null;

// Page dimensions in px (corresponds to A4 aspect ratio in style.css)
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;

// --- Initialize DOM Event Listeners ---

document.addEventListener("DOMContentLoaded", () => {
    // Initial page event listener
    setupPageEvents(document.getElementById("page-1"));
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
    
    const newPage = document.createElement("div");
    newPage.className = "a4-canvas-page active-page-border";
    newPage.id = `page-${pageCount}`;
    
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
    
    viewport.appendChild(newPage);
    setupPageEvents(newPage);
    setActivePage(pageCount);
    
    // Scroll viewport to the new page
    viewport.scrollTo({
        top: newPage.offsetTop - 40,
        behavior: 'smooth'
    });
}

function deletePage(pageId) {
    if (confirm("Are you sure you want to delete this page? All elements on this page will be lost.")) {
        const page = document.getElementById(pageId);
        if (page) {
            page.remove();
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

    if (direction > 0) {
        // Bring Forward: Move element to the end of the DOM parent list
        parent.appendChild(selectedElement);
        console.log("[*] Moved element to Front (top layer)");
    } else {
        // Send Backward: Move element to the start (after the page counter badge)
        const firstCanvasEl = parent.querySelector(".canvas-element");
        if (firstCanvasEl && firstCanvasEl !== selectedElement) {
            parent.insertBefore(selectedElement, firstCanvasEl);
        } else {
            const badge = parent.querySelector(".page-badge-counter");
            if (badge && badge.nextSibling) {
                parent.insertBefore(selectedElement, badge.nextSibling);
            } else {
                parent.insertBefore(selectedElement, parent.firstChild);
            }
        }
        console.log("[*] Moved element to Back (bottom layer)");
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
        img.style.opacity = "0.6";
        if (cropBtn) {
            cropBtn.textContent = "Finish Cropping";
            cropBtn.classList.remove("btn-secondary");
            cropBtn.classList.add("btn-primary");
        }

        // Lock image sizes in absolute pixels so resizing handles only resize the crop wrapper window frame
        img.dataset.startWidth = img.offsetWidth;
        img.dataset.startHeight = img.offsetHeight;
        img.style.width = `${img.offsetWidth}px`;
        img.style.height = `${img.offsetHeight}px`;
        if (!img.style.left) img.style.left = "0px";
        if (!img.style.top) img.style.top = "0px";

        console.log("[*] Entered Image Crop Mode");
    } else {
        // Exit Crop Mode
        isCropMode = false;
        selectedElement.classList.remove("cropping");
        selectedElement.style.overflow = "hidden";
        img.style.opacity = "1";
        if (cropBtn) {
            cropBtn.textContent = "Crop Image";
            cropBtn.classList.remove("btn-primary");
            cropBtn.classList.add("btn-secondary");
        }
        console.log("[*] Exited Image Crop Mode");
    }
}

function setupElementDragAndResize(el) {
    el.addEventListener("mousedown", (e) => {
        // Stop drag if clicking inside text-content to type, or clicking handles
        if (e.target.classList.contains("text-content") && document.activeElement === e.target) {
            return;
        }
        if (e.target.classList.contains("resize-handle")) {
            return;
        }
        
        selectElement(el, e);

        // If Crop Mode is active on image, pan the image inside the crop frame
        if (isCropMode && e.target.tagName.toLowerCase() === "img") {
            const img = e.target;
            let startX = e.clientX;
            let startY = e.clientY;
            let imgLeft = parseFloat(img.style.left) || 0;
            let imgTop = parseFloat(img.style.top) || 0;

            function onImageMouseMove(moveEvent) {
                let dx = moveEvent.clientX - startX;
                let dy = moveEvent.clientY - startY;
                img.style.left = `${imgLeft + dx}px`;
                img.style.top = `${imgTop + dy}px`;
            }

            function onImageMouseUp() {
                window.removeEventListener("mousemove", onImageMouseMove);
                window.removeEventListener("mouseup", onImageMouseUp);
            }

            window.addEventListener("mousemove", onImageMouseMove);
            window.addEventListener("mouseup", onImageMouseUp);
            return;
        }
        
        let startX = e.clientX;
        let startY = e.clientY;
        let startLeft = parseInt(el.style.left) || 0;
        let startTop = parseInt(el.style.top) || 0;
        
        function onMouseMove(moveEvent) {
            let dx = moveEvent.clientX - startX;
            let dy = moveEvent.clientY - startY;
            
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
            window.removeEventListener("mouseup", onMouseUp);
        }
        
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
    });
    
    // Setup handle dragging for resizing
    el.querySelectorAll(".resize-handle").forEach(handle => {
        handle.addEventListener("mousedown", (e) => {
            e.stopPropagation();
            e.preventDefault();
            
            const position = handle.dataset.handle;
            let startX = e.clientX;
            let startY = e.clientY;
            let startLeft = parseInt(el.style.left) || 0;
            let startTop = parseInt(el.style.top) || 0;
            let startWidth = el.offsetWidth;
            let startHeight = el.offsetHeight;
            
            function onMouseMove(moveEvent) {
                let dx = moveEvent.clientX - startX;
                let dy = moveEvent.clientY - startY;
                
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
                
                // Counteract image shifting if in Crop Mode
                if (isCropMode && el.querySelector("img")) {
                    const img = el.querySelector("img");
                    
                    if (!img.dataset.cropImgLeft) {
                        img.dataset.cropImgLeft = parseFloat(img.style.left) || 0;
                        img.dataset.cropImgTop = parseFloat(img.style.top) || 0;
                    }
                    
                    const diffLeft = newLeft - startLeft;
                    const diffTop = newTop - startTop;
                    
                    img.style.left = `${parseFloat(img.dataset.cropImgLeft) - diffLeft}px`;
                    img.style.top = `${parseFloat(img.dataset.cropImgTop) - diffTop}px`;
                }

                el.style.left = `${newLeft}px`;
                el.style.top = `${newTop}px`;
                el.style.width = `${newWidth}px`;
                el.style.height = `${newHeight}px`;
            }
            
            function onMouseUp() {
                window.removeEventListener("mousemove", onMouseMove);
                window.removeEventListener("mouseup", onMouseUp);
                
                const img = el.querySelector("img");
                if (img) {
                    delete img.dataset.cropImgLeft;
                    delete img.dataset.cropImgTop;
                }
            }
            
            window.addEventListener("mousemove", onMouseMove);
            window.addEventListener("mouseup", onMouseUp);
        });
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
            
            // Render HTML element to canvas
            const canvas = await html2canvas(pageEl, {
                scale: 2, // High resolution screenshot multiplier
                useCORS: true,
                backgroundColor: "#ffffff"
            });
            
            // Restore badges
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
