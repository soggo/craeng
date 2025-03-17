const { app, BrowserWindow, globalShortcut, screen, ipcMain, dialog } = require('electron');
const path = require('path');
const screenshot = require('screenshot-desktop');
const fs = require('fs');
const wsServer = require('./websocket-server');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

let mainWindow;
let screenshots = [];
let multiPageMode = false;
let currentPrompt = '';

// Create the main application window
// Create the main application window
function createWindow() {
  // Get all displays
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  
  // Find secondary display if it exists
  const secondaryDisplay = displays.find(d => d.id !== primaryDisplay.id);
  
  // Use secondary display if available, otherwise use primary
  const targetDisplay = secondaryDisplay || primaryDisplay;
  
  console.log('Using display:', targetDisplay.id, 
              'bounds:', targetDisplay.bounds, 
              'workArea:', targetDisplay.workArea);
  
  // Calculate position - top right of the target display
  const x = targetDisplay.workArea.x + targetDisplay.workArea.width - 420;
  const y = targetDisplay.workArea.y + 20;
  
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600, // Increased height for better readability
    x: x,
    y: y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  
  // Make sure window is visible
  mainWindow.show();
  mainWindow.focus();
  
  // Log when window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Window loaded on display:', targetDisplay.id);
    mainWindow.webContents.send('update-status', 'Ready - Window on display ' + targetDisplay.id);
  });
  
  // Initialize WebSocket server with the main window
  wsServer.initialize(mainWindow);
}

// Register global shortcuts
function registerShortcuts() {
  // Screenshot shortcut (Ctrl+Shift+S)
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (multiPageMode) {
      return;
    }
    
    captureScreenshot('Analyze this screenshot');
  });

  // Multi-page mode shortcut (Ctrl+Shift+A)
  globalShortcut.register('CommandOrControl+Shift+A', () => {
    if (multiPageMode) {
      // If already in multi-page mode, process the collected screenshots
      processMultiPageScreenshots();
    } else {
      // Start multi-page mode
      startMultiPageMode();
    }
  });

  // Multi-page capture shortcut (Ctrl+Shift+C)
  globalShortcut.register('CommandOrControl+Shift+C', () => {
    if (multiPageMode) {
      // Add current screenshot to collection
      addScreenshotToCollection();
    }
  });

  // Escape key to cancel multi-page mode
  globalShortcut.register('Escape', () => {
    if (multiPageMode) {
      cancelMultiPageMode();
    }
  });
}

// Capture screenshot and send to extension
// Capture screenshot and send to extension
async function captureScreenshot(prompt) {
  try {
    // Update status
    mainWindow.webContents.send('update-status', 'Capturing screenshot...');
    mainWindow.webContents.send('clear-result');
    
    // Capture screenshot - this might return a Buffer or a file path
    const result = await screenshot();
    
    let base64Image;
    
    // Check if result is a Buffer or a file path
    if (Buffer.isBuffer(result)) {
      // Result is already a Buffer, convert directly to base64
      base64Image = `data:image/png;base64,${result.toString('base64')}`;
    } else {
      // Result is a file path, read the file
      const imgBuffer = fs.readFileSync(result);
      base64Image = `data:image/png;base64,${imgBuffer.toString('base64')}`;
      
      // Clean up temporary file
      fs.unlinkSync(result);
    }
    
    // Send to extension via WebSocket
    const sent = wsServer.sendToAll({
      action: 'processScreenshot',
      screenshot: base64Image,
      prompt: prompt
    });
    
    if (sent) {
      mainWindow.webContents.send('update-status', 'Processing with Gemini...');
    } else {
      mainWindow.webContents.send('update-status', 'Failed to connect to extension');
      mainWindow.webContents.send('error', 'No connection to Chrome extension');
    }
  } catch (error) {
    console.error('Screenshot error:', error);
    mainWindow.webContents.send('error', error.toString());
  }
}

// Start multi-page mode
function startMultiPageMode() {
  multiPageMode = true;
  screenshots = [];
  
  // Update UI
  mainWindow.webContents.send('update-instruction', 'Multi-page mode: Ctrl+Shift+C to capture | Ctrl+Shift+A to finish | ESC to cancel');
  mainWindow.webContents.send('update-status', 'Multi-page mode started');
  mainWindow.webContents.send('clear-result');
  
  // Prompt for analysis instructions
  dialog.showInputBox({
    title: 'Analysis Instructions',
    label: 'What would you like to ask Gemini about these screenshots?',
    defaultValue: 'Analyze these screenshots'
  }).then(result => {
    if (result.canceled) {
      cancelMultiPageMode();
    } else {
      currentPrompt = result.inputValue || 'Analyze these screenshots';
    }
  });
}

// Add screenshot to collection in multi-page mode
// Add screenshot to collection in multi-page mode
async function addScreenshotToCollection() {
  try {
    // Update status
    mainWindow.webContents.send('update-status', `Capturing screenshot ${screenshots.length + 1}...`);
    
    // Capture screenshot
    const result = await screenshot();
    
    let base64Image;
    
    // Check if result is a Buffer or a file path
    if (Buffer.isBuffer(result)) {
      // Result is already a Buffer, convert directly to base64
      base64Image = `data:image/png;base64,${result.toString('base64')}`;
    } else {
      // Result is a file path, read the file
      const imgBuffer = fs.readFileSync(result);
      base64Image = `data:image/png;base64,${imgBuffer.toString('base64')}`;
      
      // Clean up temporary file
      fs.unlinkSync(result);
    }
    
    // Add to collection
    screenshots.push(base64Image);
    
    // Update UI
    mainWindow.webContents.send('update-status', `${screenshots.length} screenshot(s) captured`);
  } catch (error) {
    console.error('Screenshot error:', error);
    mainWindow.webContents.send('error', error.toString());
  }
}

// Process all collected screenshots in multi-page mode
function processMultiPageScreenshots() {
  if (screenshots.length === 0) {
    mainWindow.webContents.send('error', 'No screenshots to process');
    cancelMultiPageMode();
    return;
  }
  
  // Update status
  mainWindow.webContents.send('update-status', 'Processing multiple screenshots...');
  
  // For now, just use the first screenshot
  // In a more advanced version, you could combine images or send them in sequence
  const sent = wsServer.sendToAll({
    action: 'processScreenshot',
    screenshot: screenshots[0],
    prompt: `${currentPrompt} (1/${screenshots.length})`
  });
  
  if (sent) {
    mainWindow.webContents.send('update-status', 'Processing with Gemini...');
  } else {
    mainWindow.webContents.send('update-status', 'Failed to connect to extension');
    mainWindow.webContents.send('error', 'No connection to Chrome extension');
  }
  
  // Exit multi-page mode
  multiPageMode = false;
  screenshots = [];
  currentPrompt = '';
  
  // Reset UI
  mainWindow.webContents.send('update-instruction', 'Ctrl+Shift+S: Screenshot | Ctrl+Shift+A: Multi-mode');
}

// Cancel multi-page mode
function cancelMultiPageMode() {
  multiPageMode = false;
  screenshots = [];
  currentPrompt = '';
  
  // Reset UI
  mainWindow.webContents.send('update-instruction', 'Ctrl+Shift+S: Screenshot | Ctrl+Shift+A: Multi-mode');
  mainWindow.webContents.send('update-status', 'Multi-page mode canceled');
}

// When app is ready
app.whenReady().then(() => {
  createWindow();
  registerShortcuts();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean up before quitting
app.on('will-quit', () => {
  // Unregister all shortcuts
  globalShortcut.unregisterAll();
  
  // Close WebSocket server
  wsServer.close();
});

// IPC listeners for renderer process
ipcMain.on('capture-screenshot', (event, prompt) => {
  captureScreenshot(prompt || 'Analyze this screenshot');
});

ipcMain.on('start-multi-page', () => {
  startMultiPageMode();
});