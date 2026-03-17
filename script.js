const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
document.body.appendChild(canvas);

let size = 12; // Pixel size of each cell
let grid = [];
let stack = [];


let cols, rows, maskCtx;
let current;

let animationId; // To track and cancel previous animations

function startNewMaze() {
    // 1. Clear previous state
    if (animationId) cancelAnimationFrame(animationId);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    grid = [];
    stack = [];

    // Grab the new size from the slider
    size = parseInt(document.getElementById('sizeSlider').value);

    // 2. Get the word from the input box
    let userWord = document.getElementById('mazeWord').value || "MAZE";


    // Check if the first character is Hebrew
    const isHebrew = /[\u0590-\u05FF]/.test(userWord[0]);

    let letters = userWord.split("");
    if (isHebrew) {
        letters.reverse(); // Flip the order so it draws RTL
    }

    // 2. Setup Temporary Canvas for measurement
    const tempCtx = document.createElement('canvas').getContext('2d');
    const baseFontSize = 1000;
    tempCtx.font = `bold ${baseFontSize}px "Arial Black", Gadget, sans-serif`;

    // 3. Prepare Letter Objects for "Collision" Simulation
    let letterObjects = [];
    let currentX = 0;

    letters.forEach((char, i) => {
        const w = tempCtx.measureText(char).width;
        letterObjects.push({
            char: char,
            width: w,
            x: i * (w + 50), // Initial spread
            y: baseFontSize / 2
        });
    });


    // 4, 5, & 6 combined: Draw and Snap one by one
    const padding = 60;
    const overlapAmount = size * 1.5; // Bridge thickness

    // Prepare a temporary canvas specifically for the collision mask
    const maskCanvas = document.createElement('canvas');
    maskCtx = maskCanvas.getContext('2d');
    // Initial size (will be cropped later)
    maskCanvas.width = 20000;
    maskCanvas.height = baseFontSize + padding;
    maskCtx.font = `bold ${baseFontSize}px "Arial Black", Gadget, sans-serif`;
    maskCtx.textBaseline = "middle";
    maskCtx.fillStyle = "black";

    // 1. Helper to get the horizontal profile of a canvas
    function getProfile(context, width, height, side = 'left') {
        const imgData = context.getImageData(0, 0, width, height).data;
        let profile = new Array(height).fill(side === 'left' ? width : 0);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const alpha = imgData[((y * width) + x) * 4 + 3];
                if (alpha > 50) {
                    if (side === 'left') {
                        profile[y] = Math.min(profile[y], x);
                    } else {
                        profile[y] = Math.max(profile[y], x);
                    }
                }
            }
        }
        return profile;
    }

    let currentPlacementX = padding / 2;

    letterObjects.forEach((obj, i) => {
        const isIorJ = obj.char.toLowerCase() === 'i' || obj.char.toLowerCase() === 'j';

        if (i === 0) {
            obj.x = currentPlacementX;
            maskCtx.fillText(obj.char, obj.x, maskCanvas.height / 2);
        } else {
            const charCanvas = document.createElement('canvas');
            charCanvas.width = obj.width + 100;
            charCanvas.height = maskCanvas.height;
            const charCtx = charCanvas.getContext('2d');
            charCtx.font = maskCtx.font;
            charCtx.textBaseline = "middle";
            charCtx.fillText(obj.char, 0, charCanvas.height / 2);

            // Get profiles
            const maskRightEdge = getProfile(maskCtx, maskCanvas.width, maskCanvas.height, 'right');
            const charLeftEdge = getProfile(charCtx, charCanvas.width, charCanvas.height, 'left');

            let bestX = 0;
            let possibleCollisionRows = [];

            // Start searching from the right edge of the PREVIOUS letter specifically
            let prevObj = letterObjects[i - 1];
            let startX = prevObj.x + prevObj.width + 20;

            // Scan backwards to find the tightest fit
            for (let testX = startX; testX > prevObj.x; testX--) {
                let collisionInThisX = false;
                let currentRows = [];

                for (let y = 0; y < maskCanvas.height; y++) {
                    const leftPixelX = maskRightEdge[y];
                    const rightPixelX = testX + charLeftEdge[y];

                    // Check if they overlap or touch
                    if (leftPixelX > 0 && charLeftEdge[y] < charCanvas.width) {
                        if (leftPixelX >= rightPixelX - size) { // size creates the overlap buffer
                            collisionInThisX = true;
                            currentRows.push(y);
                        }
                    }
                }
                if (collisionInThisX) {
                    bestX = testX;
                    possibleCollisionRows = currentRows;
                    break;
                }
            }

            // Snap to grid
            obj.x = Math.ceil((bestX) / size) * size;
            maskCtx.fillText(obj.char, obj.x, maskCanvas.height / 2);

            // --- Bridge Logic ---
            if (possibleCollisionRows.length > 0) {
                // Pick a random row from the collision area
                const randomIndex = Math.floor(Math.random() * possibleCollisionRows.length);
                const safeY = possibleCollisionRows[randomIndex];

                // Keep the 2-cell height from the previous adjustment
                const bridgeRowY = Math.floor(safeY / size) * size - size;
                const bridgeStartX = maskRightEdge[safeY];
                const bridgeEndX = obj.x + charLeftEdge[safeY];

                maskCtx.fillStyle = "black";

                // Calculate standard width and add 4 cells of "padding" (2 on each side)
                const extraLength = size * 2;
                const baseWidth = Math.max(size, bridgeEndX - bridgeStartX);
                const extendedWidth = baseWidth + (size * 4);

                // Draw the bridge starting 2 cells to the left of the gap
                maskCtx.fillRect(bridgeStartX - extraLength, bridgeRowY, extendedWidth, size * 2);
            }
        }

        // --- NEW: Internal Vertical Bridge for 'i' and 'j' ---
        if (isIorJ) {
            const centerX = obj.x + (obj.width / 2);
            const snappedX = Math.floor(centerX / size) * size;
            let firstPixelY = -1;
            let gapStartY = -1;
            let gapEndY = -1;

            // Scan vertically to find the gap between dot and stem
            for (let y = 0; y < maskCanvas.height; y++) {
                const alpha = maskCtx.getImageData(snappedX + (size / 2), y, 1, 1).data[3];
                if (alpha > 50) {
                    if (firstPixelY === -1) firstPixelY = y;
                    if (gapStartY !== -1 && gapEndY === -1) {
                        gapEndY = y;
                        break;
                    }
                } else if (firstPixelY !== -1 && gapStartY === -1) {
                    gapStartY = y;
                }
            }

            // If a gap was found, fill it with a vertical bridge
            if (gapStartY !== -1 && gapEndY !== -1) {
                maskCtx.fillStyle = "black";
                maskCtx.fillRect(snappedX, gapStartY, size, gapEndY - gapStartY);
            }
        }
    });

    // Calculate dimensions
    const finalRightEdge = letterObjects[letterObjects.length - 1].x + letterObjects[letterObjects.length - 1].width;
    const mazeWidth = finalRightEdge + padding;
    const mazeHeight = maskCanvas.height;

    // Set internal resolution
    canvas.width = mazeWidth;
    canvas.height = mazeHeight;

    // Calculate scale factor to fit the screen
    const availableHeight = window.innerHeight - 200; // Account for the input box area
    const scaleX = (window.innerWidth * 0.95) / mazeWidth;
    const scaleY = availableHeight / mazeHeight;
    const scale = Math.min(scaleX, scaleY, 1);

    // Apply the scale to the CSS display size
    canvas.style.width = (mazeWidth * scale) + "px";
    canvas.style.height = (mazeHeight * scale) + "px";

    // Re-sync mask size (optional but cleaner)
    const finalMaskData = maskCtx.getImageData(0, 0, canvas.width, canvas.height);
    maskCanvas.width = canvas.width;
    maskCtx.putImageData(finalMaskData, 0, 0);




    class Cell {
        constructor(r, c) {
            this.r = r;
            this.c = c;
            this.walls = [true, true, true, true];
            this.visited = false;
            this.isValid = this.checkIfInsideText(r, c);
        }

        checkIfInsideText(r, c) {
            const x = c * size + size / 2;
            const y = r * size + size / 2;
            const pixel = maskCtx.getImageData(x, y, 1, 1).data;
            return pixel[3] > 50;
        }

        // Helper to check if a neighbor is valid without crashing at boundaries
        isV(r, c) {
            let idx = getIndex(r, c);
            return idx !== -1 && grid[idx].isValid;
        }


        // Updated helper to handle both fill and the diagonal stroke
        drawTriangle(x1, y1, x2, y2, x3, y3) {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineTo(x3, y3);
            ctx.closePath();
            ctx.fill();

            // Draw the diagonal line only (the hypotenuse)
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(x3, y3);
            ctx.stroke();
        }



        show() {
            if (!this.isValid) return;
            let x = this.c * size;
            let y = this.r * size;

            // 1. Define the points for the smoothed background polygon
            let points = [];
            if (!this.isV(this.r - 1, this.c) && !this.isV(this.r, this.c - 1)) {
                points.push({
                    x: x + size / 2,
                    y: y
                });
                points.push({
                    x: x,
                    y: y + size / 2
                });
            } else {
                points.push({
                    x: x,
                    y: y
                });
            }

            if (!this.isV(this.r + 1, this.c) && !this.isV(this.r, this.c - 1)) {
                points.push({
                    x: x,
                    y: y + size / 2
                });
                points.push({
                    x: x + size / 2,
                    y: y + size
                });
            } else {
                points.push({
                    x: x,
                    y: y + size
                });
            }

            if (!this.isV(this.r + 1, this.c) && !this.isV(this.r, this.c + 1)) {
                points.push({
                    x: x + size / 2,
                    y: y + size
                });
                points.push({
                    x: x + size,
                    y: y + size / 2
                });
            } else {
                points.push({
                    x: x + size,
                    y: y + size
                });
            }

            if (!this.isV(this.r - 1, this.c) && !this.isV(this.r, this.c + 1)) {
                points.push({
                    x: x + size,
                    y: y + size / 2
                });
                points.push({
                    x: x + size / 2,
                    y: y
                });
            } else {
                points.push({
                    x: x + size,
                    y: y
                });
            }

            // 2. Fill Background (Light Gray)
            ctx.fillStyle = this.visited ? "#ffffff" : "#555555";
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
            ctx.closePath();
            ctx.fill();

            // 3. Draw ONLY the Perimeter (Black Lines)
            ctx.strokeStyle = "black";
            ctx.lineWidth = 2;
            ctx.lineJoin = "round"; // Fixes the "staircase" sharp joins

            ctx.beginPath();
            for (let i = 0; i < points.length; i++) {
                let p1 = points[i];
                let p2 = points[(i + 1) % points.length]; // Connect back to start

                // Check if the midpoint of this segment is on the boundary
                let midX = (p1.x + p2.x) / 2;
                let midY = (p1.y + p2.y) / 2;
                let centerX = x + size / 2;
                let centerY = y + size / 2;

                let isBoundary = false;
                if (midY < centerY && !this.isV(this.r - 1, this.c)) isBoundary = true; // Top
                if (midX > centerX && !this.isV(this.r, this.c + 1)) isBoundary = true; // Right
                if (midY > centerY && !this.isV(this.r + 1, this.c)) isBoundary = true; // Bottom
                if (midX < centerX && !this.isV(this.r, this.c - 1)) isBoundary = true; // Left

                if (isBoundary) {
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                }
            }
            ctx.stroke();

            // 4. Draw Diagonals (The "Smoothing" lines)
            // Always draw these if they exist because they only exist on edges
            ctx.beginPath();
            if (!this.isV(this.r - 1, this.c) && !this.isV(this.r, this.c - 1)) { // Top-Left
                ctx.moveTo(x + size / 2, y);
                ctx.lineTo(x, y + size / 2);
            }
            if (!this.isV(this.r + 1, this.c) && !this.isV(this.r, this.c - 1)) { // Bottom-Left
                ctx.moveTo(x, y + size / 2);
                ctx.lineTo(x + size / 2, y + size);
            }
            if (!this.isV(this.r + 1, this.c) && !this.isV(this.r, this.c + 1)) { // Bottom-Right
                ctx.moveTo(x + size / 2, y + size);
                ctx.lineTo(x + size, y + size / 2);
            }
            if (!this.isV(this.r - 1, this.c) && !this.isV(this.r, this.c + 1)) { // Top-Right
                ctx.moveTo(x + size, y + size / 2);
                ctx.lineTo(x + size / 2, y);
            }
            ctx.stroke();

            // 5. Draw Internal Maze Walls
            ctx.beginPath();
            if (this.walls[0] && this.isV(this.r - 1, this.c)) {
                ctx.moveTo(x, y);
                ctx.lineTo(x + size, y);
            }
            if (this.walls[1] && this.isV(this.r, this.c + 1)) {
                ctx.moveTo(x + size, y);
                ctx.lineTo(x + size, y + size);
            }
            if (this.walls[2] && this.isV(this.r + 1, this.c)) {
                ctx.moveTo(x + size, y + size);
                ctx.lineTo(x, y + size);
            }
            if (this.walls[3] && this.isV(this.r, this.c - 1)) {
                ctx.moveTo(x, y + size);
                ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Generator Head
            // if (this === current) {
            //       ctx.fillStyle = "#ff0000";
            //        ctx.fillRect(x + size/4, y + size/4, size/2, size/2);
            //    }
        }

    }


    // Calculate rows and columns based on final canvas size
    cols = Math.floor(canvas.width / size);
    rows = Math.floor(canvas.height / size);

    // 8. Initialize Grid
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            grid.push(new Cell(r, c));
        }
    }

    function getIndex(r, c) {
        if (c < 0 || r < 0 || c > cols - 1 || r > rows - 1) return -1;
        return c + r * cols;
    }

    function getNeighbor(cell) {
        let neighbors = [];
        let directions = [
            [-1, 0],
            [0, 1],
            [1, 0],
            [0, -1]
        ];

        for (let d of directions) {
            let index = getIndex(cell.r + d[0], cell.c + d[1]);
            let neighbor = grid[index];
            if (neighbor && neighbor.isValid && !neighbor.visited) {
                neighbors.push(neighbor);
            }
        }
        return neighbors.length > 0 ? neighbors[Math.floor(Math.random() * neighbors.length)] : undefined;
    }

    function removeWalls(a, b) {
        let x = a.c - b.c;
        if (x === 1) {
            a.walls[3] = false;
            b.walls[1] = false;
        } else if (x === -1) {
            a.walls[1] = false;
            b.walls[3] = false;
        }
        let y = a.r - b.r;
        if (y === 1) {
            a.walls[0] = false;
            b.walls[2] = false;
        } else if (y === -1) {
            a.walls[2] = false;
            b.walls[0] = false;
        }
    }

    function setup() {
        let validCells = grid.filter(cell => cell.isValid);
        if (validCells.length === 0) return;
        current = validCells[0];
        current.visited = true;
        stack.push(current);
        draw();
    }

    function draw() {
        // Process more steps per frame\
        //let stepsPerFrame = Math.floor(grid.length * 0.003);
        // Get the slider value (1 to 100)
        const speedVal = document.getElementById('speedSlider').value;

        // Convert that value into a percentage of the total grid size
        // Higher slider = more steps calculated before the screen refreshes
        let stepsPerFrame = Math.floor(grid.length * (speedVal / 1000));

        // Ensure it's at least 1 so the maze doesn't stop
        if (stepsPerFrame < 1) stepsPerFrame = 1;
        for (let i = 0; i < stepsPerFrame; i++) {
            if (stack.length > 0) {
                let next = getNeighbor(current);
                if (next) {
                    next.visited = true;
                    stack.push(current);
                    removeWalls(current, next);
                    current = next;
                } else {
                    current = stack.pop();
                }
            }
        }

        // Fill the outside
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Render each cell using the new 'show' logic
        for (let cell of grid) {
            cell.show();
        }

        if (stack.length > 0) {
            requestAnimationFrame(draw);
        }
    }



    // 3. Start the process
    setup();
}

// Initial call to start the first maze on page load
window.onload = startNewMaze;
