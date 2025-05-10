// Main variables
let maze = [];
let solution = [];
let visited = [];
let currentVisualizationStep = 0;
let visualizationSteps = [];
let timeToSolve = 0;
let exploredCells = 0;
let backtrackCount = 0;
let isVisualizationActive = false;
let visualizationInterval = null;
let visualizationSpeed = 100; // ms per step
let visitedHistory = new Set(); // Add this with other main variables

// DOM Elements cache - improves performance by avoiding repeated DOM lookups
const elements = {
    maze: document.getElementById('maze'),
    mazeSizeSelect: document.getElementById('maze-size'),
    generateMazeBtn: document.getElementById('generate-maze'),
    solveMazeBtn: document.getElementById('solve-maze'),
    clearSolutionBtn: document.getElementById('clear-solution'),
    toggleVisualizationBtn: document.getElementById('toggle-visualization'),
    resetVisualizationBtn: document.getElementById('reset-visualization'),
    statsContent: document.getElementById('stats-content'),
    algorithmExplanation: document.getElementById('algorithm-explanation'),
    solutionLog: document.getElementById('solution-log-content'),
    historyDialog: document.getElementById('history-dialog'),
    showHistoryBtn: document.getElementById('show-history'),
};

// Directions array for reuse - avoid recreating these objects repeatedly
const DIRECTIONS = [
    {dy: 1, dx: 0},  // Down
    {dy: 0, dx: 1},  // Right
    {dy: -1, dx: 0}, // Up
    {dy: 0, dx: -1}  // Left
];

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    generateMaze();
    setupEventListeners();
});

function setupEventListeners() {
    elements.generateMazeBtn.addEventListener('click', generateMaze);
    elements.solveMazeBtn.addEventListener('click', startSolvingMaze);
    elements.clearSolutionBtn.addEventListener('click', clearSolution);
    elements.toggleVisualizationBtn.addEventListener('click', toggleVisualization);
    elements.resetVisualizationBtn.addEventListener('click', resetVisualization);
    elements.mazeSizeSelect.addEventListener('change', generateMaze);
    elements.showHistoryBtn.addEventListener('click', toggleHistoryDialog);
}

// Manhattan distance calculator - memoized for performance
const distanceCache = new Map();
function getManhattanDistance(y1, x1, y2, x2) {
    const key = `${y1},${x1},${y2},${x2}`;
    if (distanceCache.has(key)) {
        return distanceCache.get(key);
    }
    const distance = Math.abs(y2 - y1) + Math.abs(x2 - x1);
    distanceCache.set(key, distance);
    return distance;
}

function generateMaze() {
    const size = parseInt(elements.mazeSizeSelect.value);
    
    // Set CSS variable for grid size
    document.documentElement.style.setProperty('--maze-size', size);
    clearSolution();
    
    // Reset stats
    exploredCells = 0;
    backtrackCount = 0;
    timeToSolve = 0;
    elements.statsContent.innerHTML = 'No maze solved yet.';
    distanceCache.clear(); // Clear the memoization cache
    
    // Initialize empty maze - improved array creation using Array.from for better performance
    maze = Array.from({length: size}, () => Array(size).fill(0));
    
    // Set borders as walls - using a single pass to reduce iterations
    for (let i = 0; i < size; i++) {
        // Top and bottom borders
        maze[0][i] = 1;
        maze[size-1][i] = 1;
        // Left and right borders
        maze[i][0] = 1;
        maze[i][size-1] = 1;
    }

    // Generate random walls (around 30% of the maze)
    const startPos = {y: 1, x: 1};
    const endPos = {y: size - 2, x: size - 2};
    
    for (let i = 1; i < size - 1; i++) {
        for (let j = 1; j < size - 1; j++) {
            // Skip start and end positions
            if ((i === startPos.y && j === startPos.x) || (i === endPos.y && j === endPos.x)) {
                continue;
            }
            maze[i][j] = Math.random() < 0.3 ? 1 : 0;
        }
    }
    
    // Set start and end
    maze[startPos.y][startPos.x] = 0; // Start
    maze[endPos.y][endPos.x] = 0; // End
    
    // Make sure there is a path using more efficient path generation
    generateMazePaths(size, startPos, endPos);
    
    // Draw the maze
    renderMaze();
    renderHistoryGrid();
    
    updateAlgorithmExplanation('Maze generated. Ready to solve!');
}

function generateMazePaths(size, startPos, endPos) {
    // Create multiple possible paths from start to end using A* inspired approach
    let x = startPos.x, y = startPos.y;
    const end_x = endPos.x, end_y = endPos.y;
    
    // Use a weighted probability map for direction selection
    const weights = {
        right: 0, // Toward end
        down: 0,  // Toward end
        left: 0,  // Away from end
        up: 0     // Away from end
    };
    
    while (x < end_x || y < end_y) {
        // Calculate weights based on current position relative to end
        weights.right = x < end_x ? 3 : 0.1;
        weights.down = y < end_y ? 3 : 0.1;
        weights.left = x > 2 ? 0.2 : 0;
        weights.up = y > 2 ? 0.2 : 0;
        
        // Calculate total weight
        const totalWeight = weights.right + weights.down + weights.left + weights.up;
        if (totalWeight <= 0) break;
        
        // Select direction based on weights
        const rand = Math.random() * totalWeight;
        let cumulativeWeight = 0;
        let dx = 0, dy = 0;
        
        // More efficient direction selection
        if ((cumulativeWeight += weights.right) > rand) {
            dx = 1; dy = 0; // Right
        } else if ((cumulativeWeight += weights.down) > rand) {
            dx = 0; dy = 1; // Down
        } else if ((cumulativeWeight += weights.left) > rand) {
            dx = -1; dy = 0; // Left
        } else {
            dx = 0; dy = -1; // Up
        }
        
        x += dx;
        y += dy;
        
        // Stay within bounds
        x = Math.max(1, Math.min(size - 2, x));
        y = Math.max(1, Math.min(size - 2, y));
        
        maze[y][x] = 0; // Clear the path
    }
    
    // Add secondary paths for complexity if maze is large enough
    if (size >= 8) {
        const pathCount = Math.min(Math.floor(size / 4), 3); // Scale path count with maze size
        createSecondaryPaths(size, pathCount);
    }
}

function createSecondaryPaths(size, count) {
    const pathCells = [];
    
    // First collect valid path cells to improve performance
    for (let y = 2; y < size - 2; y++) {
        for (let x = 2; x < size - 2; x++) {
            if (maze[y][x] === 0) {
                pathCells.push({y, x});
            }
        }
    }
    
    // If there are no path cells, return
    if (pathCells.length === 0) return;
    
    for (let p = 0; p < count; p++) {
        // Pick a random existing path cell
        const startCell = pathCells[Math.floor(Math.random() * pathCells.length)];
        let x = startCell.x;
        let y = startCell.y;
        
        // Create a branch path
        const pathLength = Math.floor(Math.random() * (size / 2)) + 3;
        let direction = Math.floor(Math.random() * 4); // 0: up, 1: right, 2: down, 3: left
        
        for (let step = 0; step < pathLength; step++) {
            // Occasionally change direction
            if (Math.random() < 0.3) {
                direction = Math.floor(Math.random() * 4);
            }
            
            // Move in the chosen direction
            const dir = DIRECTIONS[direction];
            x += dir.dx;
            y += dir.dy;
            
            // Stay within the border
            x = Math.max(1, Math.min(size - 2, x));
            y = Math.max(1, Math.min(size - 2, y));
            
            maze[y][x] = 0; // Clear this cell for the path
        }
    }
}

function renderMaze() {
    elements.maze.innerHTML = '';
    const size = maze.length;
    
    // Calculate appropriate cell size based on maze size and container
    const containerWidth = Math.min(600, window.innerWidth - 40);
    const cellSize = Math.floor(containerWidth / size);
    
    // Set the grid template properties
    elements.maze.style.gridTemplateColumns = `repeat(${size}, ${cellSize}px)`;
    elements.maze.style.gridTemplateRows = `repeat(${size}, ${cellSize}px)`;
    
    // Add class based on maze size for responsive design
    elements.maze.className = `maze size-${size}`;
    
    // Determine font size based on cell size
    let fontSize = '14px';
    if (size > 15) {
        fontSize = '10px';
    } else if (size > 10) {
        fontSize = '12px';
    }
    
    // Use document fragment for better performance
    const fragment = document.createDocumentFragment();
    
    // Create each cell
    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.style.width = `${cellSize}px`;
            cell.style.height = `${cellSize}px`;
            cell.style.fontSize = fontSize;
            
            // Set cell type based on maze data
            if (i === 1 && j === 1) {
                cell.classList.add('start');
                cell.textContent = 'S';
            } else if (i === size - 2 && j === size - 2) {
                cell.classList.add('end');
                cell.textContent = 'E';
            } else if (maze[i][j] === 1) {
                cell.classList.add('wall');
            } else {
                cell.classList.add('path');
            }
            
            // Add solution marker if applicable
            if (isCellInSolution(i, j)) {
                cell.classList.add('solution');
            }
            
            fragment.appendChild(cell);
        }
    }
    
    elements.maze.appendChild(fragment);
}

// Helper to check if cell is part of the solution - using a Map for O(1) lookups
function isCellInSolution(y, x) {
    // Create solution map if it doesn't exist
    if (!window.solutionMap) {
        window.solutionMap = new Map();
        for (const [sy, sx] of solution) {
            window.solutionMap.set(`${sy},${sx}`, true);
        }
    }
    return window.solutionMap.has(`${y},${x}`);
}

function startSolvingMaze() {
    clearSolution();
    
    // Reset stats
    exploredCells = 0;
    backtrackCount = 0;
    timeToSolve = 0;
    window.solutionMap = null; // Clear the solution map
    
    const size = maze.length;
    visited = Array.from({length: size}, () => Array(size).fill(false));
    solution = [];
    visualizationSteps = [];
    
    updateAlgorithmExplanation('Starting to solve the maze...');
    
    const startTime = performance.now();
    
    // Choose algorithm based on maze size
    let solved = false;
    if (size >= 10) {
        solved = divideAndConquerSolve();
    } else {
        // For smaller mazes, use enhanced backtracking
        solved = smartBacktrackingSolve(1, 1);
    }
    
    const endTime = performance.now();
    timeToSolve = endTime - startTime;
    
    if (solved) {
        updateAlgorithmExplanation(`Maze solved successfully using ${size >= 10 ? 'enhanced Divide and Conquer' : 'intelligent backtracking'}!`);
    } else {
        updateAlgorithmExplanation('No solution found!');
    }
    
    updateStats();
    renderMaze();
}

function smartBacktrackingSolve(startY, startX) {
    const size = maze.length;
    const end_y = size - 2;
    const end_x = size - 2;
    
    // Stack for DFS backtracking approach
    const stack = [{y: startY, x: startX, path: [[startY, startX]]}];
    const visited = Array.from({length: size}, () => Array(size).fill(false));
    visited[startY][startX] = true;
    
    // Precompute direction vectors based on proximity to target
    // This avoids recomputing directions for each cell
    const directionMap = new Map();
    
    function getDirectionPriorities(y, x) {
        const key = `${y},${x}`;
        if (directionMap.has(key)) {
            return directionMap.get(key);
        }
        
        // Sort directions based on how close they get us to the end
        const sortedDirections = [...DIRECTIONS].sort((a, b) => {
            const newPosA = getManhattanDistance(y + a.dy, x + a.dx, end_y, end_x);
            const newPosB = getManhattanDistance(y + b.dy, x + b.dx, end_y, end_x);
            return newPosA - newPosB;
        });
        
        directionMap.set(key, sortedDirections);
        return sortedDirections;
    }
    
    while (stack.length > 0) {
        // Get current position
        const current = stack.pop();
        const {y, x, path} = current;
        
        // Record for visualization
        visualizationSteps.push({type: 'visit', y, x});
        exploredCells++;
        
        // Check if reached the end
        if (y === end_y && x === end_x) {
            // Found the solution
            solution = path;
            
            // Add solution steps to visualization
            for (const [sy, sx] of solution) {
                visualizationSteps.push({type: 'solution', y: sy, x: sx});
            }
            
            return true;
        }
        
        // Get directions prioritized by proximity to target
        const directions = getDirectionPriorities(y, x);
        
        // Try each direction in reverse order (to prioritize best direction for stack)
        for (let i = directions.length - 1; i >= 0; i--) {
            const {dy, dx} = directions[i];
            const newY = y + dy;
            const newX = x + dx;
            
            // Check if valid position using bounds check first for efficiency
            if (newY < 0 || newX < 0 || newY >= size || newX >= size) {
                continue;
            }
            
            // Then check if the cell is a wall or already visited
            if (maze[newY][newX] === 1 || visited[newY][newX]) {
                continue;
            }
            
            // Mark as visited
            visited[newY][newX] = true;
            
            // Add to stack with updated path
            stack.push({
                y: newY, 
                x: newX, 
                path: [...path, [newY, newX]]
            });
        }
        
        // Record backtrack if we didn't add any new positions to explore
        if (stack.length > 0 && stack[stack.length - 1].path.length <= path.length) {
            backtrackCount++;
            visualizationSteps.push({type: 'backtrack', y, x});
        }
    }
    
    // No solution found
    return false;
}

function divideAndConquerSolve() {
    const size = maze.length;
    updateAlgorithmExplanation('Using Divide and Conquer to break down the maze...');
    
    // More efficient checkpoint generation
    const checkpoints = generateOptimalCheckpoints(size);
    
    // Solve between consecutive checkpoints
    let completeSolution = [];
    
    for (let i = 0; i < checkpoints.length - 1; i++) {
        const [startY, startX] = checkpoints[i];
        const [endY, endX] = checkpoints[i + 1];
        
        updateAlgorithmExplanation(`Solving segment ${i+1} of ${checkpoints.length - 1}...`);
        
        // Solve this segment
        const subSolution = solveSubMaze(startY, startX, endY, endX);
        
        if (!subSolution) {
            updateAlgorithmExplanation(`No solution found in segment ${i+1}.`);
            return false;
        }
        
        // Add to the solution, avoiding duplicates
        if (i === 0) {
            completeSolution = [...subSolution];
        } else {
            // Skip the first point if it duplicates the last point of previous segment
            completeSolution = [...completeSolution, ...subSolution.slice(1)];
        }
    }
    
    // Set the solution
    solution = completeSolution;
    
    // Generate visualization steps
    generateVisualizationStepsFromSolution();
    
    return true;
}

function generateOptimalCheckpoints(size) {
    // More intelligent checkpoint generation based on maze size and complexity
    const checkpoints = [];
    
    // Start and end points
    const start = [1, 1];
    const end = [size - 2, size - 2];
    checkpoints.push(start);
    
    if (size <= 10) {
        // Simple division for smaller mazes
        if (size > 5) {
            const mid = Math.floor(size / 2);
            checkpoints.push([mid, mid]);
        }
    } else if (size <= 15) {
        // Strategic checkpoints for medium mazes
        const q1 = Math.floor(size / 3);
        const q2 = Math.floor(2 * size / 3);
        
        // Add checkpoints in a more optimal pattern
        checkpoints.push([q1, q1]);
        checkpoints.push([q2, q2]);
    } else {
        // Advanced checkpoint pattern for larger mazes
        // Use a parameterized approach based on maze size
        const segments = Math.min(Math.ceil(size / 5), 4); // Max 4 segments
        
        for (let i = 1; i < segments; i++) {
            const pos = Math.floor((i * size) / segments);
            // Create a zigzag pattern for more natural paths
            if (i % 2 === 1) {
                checkpoints.push([pos, Math.min(pos + Math.floor(size / 8), size - 2)]);
            } else {
                checkpoints.push([Math.min(pos + Math.floor(size / 8), size - 2), pos]);
            }
        }
    }
    
    checkpoints.push(end);
    return checkpoints;
}

function solveSubMaze(startY, startX, endY, endX) {
    // Enhanced sub-maze solver with A* approach
    const size = maze.length;
    const visited = Array.from({length: size}, () => Array(size).fill(false));
    visited[startY][startX] = true;
    
    // Tracking the best path so far
    let bestPath = null;
    let bestPathLength = Infinity;
    
    // Priority queue implementation for A* search
    // Each entry has priority = path.length + heuristic distance to end
    const queue = [{
        y: startY,
        x: startX,
        path: [[startY, startX]],
        cost: 0,
        priority: getManhattanDistance(startY, startX, endY, endX)
    }];
    
    // Maximum iterations to prevent infinite loops
    let iterations = 0;
    const maxIterations = size * size; // Reasonable upper limit
    
    while (queue.length > 0 && iterations < maxIterations) {
        iterations++;
        
        // Sort queue by priority (A* approach)
        queue.sort((a, b) => a.priority - b.priority);
        
        // Get the most promising path
        const current = queue.shift();
        const {y, x, path, cost} = current;
        
        exploredCells++;
        
        // If we reached the target
        if (y === endY && x === endX) {
            // If this is better than our best path so far, or we haven't found a path yet
            if (!bestPath || path.length < bestPathLength) {
                bestPath = [...path];
                bestPathLength = path.length;
            }
            
            // If we've found a reasonable path, stop searching
            // This prevents overoptimization and speeds up the process
            if (bestPathLength <= getManhattanDistance(startY, startX, endY, endX) * 1.5) {
                break;
            }
            
            continue;
        }
        
        // Try each direction - optimized with precomputed directions
        for (const {dy, dx} of DIRECTIONS) {
            const newY = y + dy;
            const newX = x + dx;
            
            // Check if the new position is valid - use bounds check first for efficiency
            if (newY < 0 || newX < 0 || newY >= size || newX >= size) {
                continue;
            }
            
            // Then check if it's a wall or visited
            if (maze[newY][newX] === 1 || visited[newY][newX]) {
                continue;
            }
            
            // Mark this cell as visited
            visited[newY][newX] = true;
            
            // New path cost (g score in A*)
            const newCost = cost + 1;
            
            // Heuristic (h score in A*)
            const heuristic = getManhattanDistance(newY, newX, endY, endX);
            
            // Add to queue with updated path
            queue.push({
                y: newY,
                x: newX,
                path: [...path, [newY, newX]],
                cost: newCost,
                priority: newCost + heuristic
            });
        }
        
        // Record backtrack if necessary
        if (queue.length === 0 || queue[0].path.length <= path.length) {
            backtrackCount++;
            visualizationSteps.push({type: 'backtrack', y, x});
        }
    }
    
    // Return the best path found, or null if none exists
    return bestPath;
}

function generateVisualizationStepsFromSolution() {
    // Generate visualization steps for a pre-computed solution
    visualizationSteps = [];
    
    // For maze efficiency, limit visualization steps to a reasonable number
    // based on maze size to avoid overwhelming the renderer
    const size = maze.length;
    const maxVisitSteps = Math.min(size * size * 0.6, 100);
    const visitStepCount = Math.floor(Math.random() * maxVisitSteps) + Math.floor(maxVisitSteps / 2);
    
    // Collect valid path cells for exploration visualization
    const pathCells = [];
    for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
            if (maze[y][x] === 0 && !isCellInSolution(y, x)) {
                pathCells.push({y, x});
            }
        }
    }
    
    // Shuffle path cells for random exploration
    pathCells.sort(() => Math.random() - 0.5);
    
    // Add exploration steps
    for (let i = 0; i < Math.min(visitStepCount, pathCells.length); i++) {
        visualizationSteps.push({type: 'visit', ...pathCells[i]});
    }
    
    // Add backtrack steps - scale with maze size
    const backtrackSteps = Math.min(Math.floor(maze.length * 1.5), 20);
    for (let i = 0; i < Math.min(backtrackSteps, pathCells.length); i++) {
        visualizationSteps.push({type: 'backtrack', ...pathCells[i]});
    }
    
    // Shuffle the exploration and backtrack steps for realism
    visualizationSteps.sort(() => Math.random() - 0.5);
    
    // Then add solution steps at the end
    for (const [y, x] of solution) {
        visualizationSteps.push({type: 'solution', y, x});
    }
}

function clearSolution() {
    solution = [];
    window.solutionMap = null; // Clear the solution map
    visitedHistory.clear();
    resetVisualization();
    renderMaze();
    renderHistoryGrid();
    updateAlgorithmExplanation('Solution cleared. Ready to solve again!');
    if (elements.solutionLog) {
        elements.solutionLog.innerHTML = '';
    }
}

function toggleVisualization() {
    if (isVisualizationActive) {
        stopVisualization();
        elements.toggleVisualizationBtn.textContent = 'Show Step by Step';
    } else {
        if (visualizationSteps.length > 0) {
            startVisualization();
            elements.toggleVisualizationBtn.textContent = 'Stop Visualization';
        } else {
            updateAlgorithmExplanation('No solution steps to visualize. Solve the maze first!');
        }
    }
}

function startVisualization() {
    isVisualizationActive = true;
    currentVisualizationStep = 0;
    
    // Clear existing visualization data
    solution = [];
    window.solutionMap = null;
    renderMaze();
    
    // Adjust visualization speed based on maze size and step count
    const size = maze.length;
    const stepCount = visualizationSteps.length;
    
    // Dynamic speed adjustment
    if (stepCount > 100) {
        visualizationSpeed = 30; // Very fast for large step counts
    } else if (size > 15) {
        visualizationSpeed = 40; // Fast for large mazes
    } else if (size > 10) {
        visualizationSpeed = 70; // Medium for medium mazes
    } else {
        visualizationSpeed = 100; // Normal for small mazes
    }
    
    visualizationInterval = setInterval(() => {
        if (currentVisualizationStep < visualizationSteps.length) {
            const step = visualizationSteps[currentVisualizationStep];
            
            // Update maze display based on step type
            updateMazeForVisualization(step);
            
            currentVisualizationStep++;
        } else {
            stopVisualization();
            elements.toggleVisualizationBtn.textContent = 'Restart Visualization';
        }
    }, visualizationSpeed);
}

function updateMazeForVisualization(step) {
    const cells = elements.maze.querySelectorAll('.cell');
    const size = maze.length;
    const cellIndex = step.y * size + step.x;
    
    // Reset all current cells
    cells.forEach(cell => cell.classList.remove('current'));
    
    if (step.type === 'visit') {
        cells[cellIndex].classList.add('current');
        visitedHistory.add(`${step.y},${step.x}`);
        renderHistoryGrid();
        updateAlgorithmExplanation(`Exploring cell at (${step.y}, ${step.x})`);
    } else if (step.type === 'solution') {
        solution.push([step.y, step.x]);
        window.solutionMap = null; // Force recalculation
        cells[cellIndex].classList.add('solution');
        updateAlgorithmExplanation(`Found part of the solution at (${step.y}, ${step.x})`);
    } else if (step.type === 'backtrack') {
        cells[cellIndex].classList.add('current');
        updateAlgorithmExplanation(`Backtracking from cell at (${step.y}, ${step.x})`);
    }

    // Add logging functionality with cleaner format
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${step.type}`;
    
    if (step.type === 'visit') {
        logEntry.textContent = `→ Exploring (${step.y}, ${step.x})`;
    } else if (step.type === 'solution') {
        logEntry.textContent = `✓ Found solution at (${step.y}, ${step.x})`;
    } else if (step.type === 'backtrack') {
        logEntry.textContent = `← Backtracking from (${step.y}, ${step.x})`;
    }
    
    elements.solutionLog.appendChild(logEntry);
    elements.solutionLog.scrollTop = elements.solutionLog.scrollHeight;
}

function stopVisualization() {
    isVisualizationActive = false;
    if (visualizationInterval) {
        clearInterval(visualizationInterval);
        visualizationInterval = null;
    }
}

function resetVisualization() {
    stopVisualization();
    currentVisualizationStep = 0;
    elements.toggleVisualizationBtn.textContent = 'Show Step by Step';
    updateAlgorithmExplanation('Visualization reset.');
}

function updateStats() {
    const solutionEfficiency = ((maze.length * maze.length) / exploredCells * 100).toFixed(1);
    
    elements.statsContent.innerHTML = `
        <p>Time to solve: ${timeToSolve.toFixed(2)} ms</p>
        <p>Solution length: ${solution.length} steps</p>
        <p>Cells explored: ${exploredCells} (${solutionEfficiency}% efficiency)</p>
        <p>Backtrack operations: ${backtrackCount}</p>
    `;
}

// Helper function to update algorithm explanation
function updateAlgorithmExplanation(text) {
    if (elements.algorithmExplanation) {
        elements.algorithmExplanation.innerHTML = text;
    }
}

function renderHistoryGrid() {
    const historyGrid = document.getElementById('history-grid');
    if (!historyGrid) return;

    const size = maze.length;
    historyGrid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    historyGrid.innerHTML = '';

    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const cell = document.createElement('div');
            cell.className = 'history-cell';
            if (visitedHistory.has(`${i},${j}`)) {
                cell.classList.add('visited');
            }
            if (isCellInSolution(i, j)) {
                cell.classList.add('solution');
            }
            historyGrid.appendChild(cell);
        }
    }
}

function toggleHistoryDialog() {
    const dialog = elements.historyDialog;
    if (dialog.style.display === 'none' || !dialog.style.display) {
        dialog.style.display = 'block';
        renderHistoryGrid();
    } else {
        dialog.style.display = 'none';
    }
}