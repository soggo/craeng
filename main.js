const { app, BrowserWindow, globalShortcut, screen } = require('electron');
const path = require('path');
const screenshot = require('screenshot-desktop');
const fs = require('fs');
const wsServer = require('./websocket-server');

let mainWindow;
let screenshots = [];
let multiPageMode = false;

function updateInstruction(instruction) {
  if (mainWindow?.webContents) {
    mainWindow.webContents.send('update-instruction', instruction);
  }
}

function hideInstruction() {
  if (mainWindow?.webContents) {
    mainWindow.webContents.send('hide-instruction');
  }
}

async function captureScreenshot() {
  try {
    // Clear previous results immediately
    mainWindow.webContents.send('clear-result');
    mainWindow.webContents.send('update-status', 'Taking screenshot...');
    
    hideInstruction();
    mainWindow.hide();
    await new Promise(res => setTimeout(res, 200));

    const timestamp = Date.now();
    const imagePath = path.join(app.getPath('pictures'), `screenshot_${timestamp}.png`);
    await screenshot({ filename: imagePath });

    // Read the image file as base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    // Show window again with status
    mainWindow.show();
    mainWindow.webContents.send('update-status', 'Sending to Gemini...');

    // Send to Chrome extension via WebSocket
    const sent = wsServer.sendToAll({
      action: 'processScreenshot',
      screenshot: base64Image,
      prompt: "Solve this problem and provide only the final answer or code with no explanations."
    });

    if (!sent) {
      mainWindow.webContents.send('error', 'No extension connected. Make sure the Chrome extension is installed and running.');
    }
    
    return base64Image;
  } catch (err) {
    mainWindow.show();
    if (mainWindow.webContents) {
      mainWindow.webContents.send('error', err.message);
    }
    throw err;
  }
}

async function processScreenshots() {
  try {
    if (screenshots.length === 0) {
      mainWindow.webContents.send('error', 'No screenshots to process.');
      return;
    }

    // Process each screenshot one by one using the extension
    for (const [index, img] of screenshots.entries()) {
      mainWindow.webContents.send('update-status', `Processing screenshot ${index + 1}/${screenshots.length}...`);
      
      // Send to Chrome extension via WebSocket
      wsServer.sendToAll({
        action: 'processScreenshot',
        screenshot: img,
        prompt: "Solve this problem and provide only the final answer or code with no explanations."
      });
      
      // We'll get the result asynchronously via the WebSocket
    }
    
    // Clear screenshots after processing
    screenshots = [];
    multiPageMode = false;
  } catch (err) {
    console.error("Error in processScreenshots:", err);
    if (mainWindow.webContents) {
      mainWindow.webContents.send('error', err.message);
    }
  }
}

// Reset everything
function resetProcess() {
  screenshots = [];
  multiPageMode = false;
  mainWindow.webContents.send('clear-result');
  updateInstruction("Ctrl+Shift+S: Screenshot | Ctrl+Shift+A: Multi-mode");
}

function createWindow() {
  // Get all displays
  const displays = screen.getAllDisplays();
  
  // Use the secondary display if available
  const secondaryDisplay = displays.length > 1 ? displays[1] : displays[0];
  
  // Create the window on the secondary display
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    x: secondaryDisplay.bounds.x + 50,
    y: secondaryDisplay.bounds.y + 50,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    paintWhenInitiallyHidden: true,
    contentProtection: true,
    type: 'toolbar',
  });

  mainWindow.loadFile('index.html');
  mainWindow.setContentProtection(true);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);

  // Initialize WebSocket server
  wsServer.initialize(mainWindow);

  // Ctrl+Shift+S => single or final screenshot
  globalShortcut.register('CommandOrControl+Shift+S', async () => {
    try {
      const img = await captureScreenshot();
      if (multiPageMode) {
        screenshots.push(img);
        await processScreenshots();
      }
    } catch (error) {
      console.error("Ctrl+Shift+S error:", error);
    }
  });

  // Ctrl+Shift+A => multi-page mode
  globalShortcut.register('CommandOrControl+Shift+A', async () => {
    try {
      if (!multiPageMode) {
        multiPageMode = true;
        updateInstruction("Multi-mode: Ctrl+Shift+A to add, Ctrl+Shift+S to finalize");
      }
      const img = await captureScreenshot();
      screenshots.push(img);
      updateInstruction("Multi-mode: Ctrl+Shift+A to add, Ctrl+Shift+S to finalize");
    } catch (error) {
      console.error("Ctrl+Shift+A error:", error);
    }
  });

  // Ctrl+Shift+R => reset
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    resetProcess();
  });
     
  // Ctrl+Shift+Q => Quit the application
  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    console.log("Quitting application...");
    app.quit();
  });
  
  // Add shortcut to move window between displays
  globalShortcut.register('CommandOrControl+Shift+M', () => {
    const displays = screen.getAllDisplays();
    const currentDisplay = screen.getDisplayNearestPoint({
      x: mainWindow.getBounds().x,
      y: mainWindow.getBounds().y
    });
    
    // Find the next display (cycle through available displays)
    const currentIndex = displays.findIndex(d => 
      d.id === currentDisplay.id
    );
    const nextIndex = (currentIndex + 1) % displays.length;
    const nextDisplay = displays[nextIndex];
    
    // Move window to the next display
    mainWindow.setBounds({
      x: nextDisplay.bounds.x + 50,
      y: nextDisplay.bounds.y + 50,
      width: mainWindow.getBounds().width,
      height: mainWindow.getBounds().height
    });
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  wsServer.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});