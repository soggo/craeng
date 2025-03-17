// Set up WebSocket connection to Electron app
let socket = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

function connectWebSocket() {
  socket = new WebSocket('ws://localhost:8765');
  
  socket.onopen = () => {
    console.log('Connected to Electron app');
    reconnectAttempts = 0;
  };
  
  socket.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log('Received message from Electron app:', message);
      
      if (message.action === 'processScreenshot') {
        const result = await processScreenshot(message.screenshot, message.prompt);
        
        // Send result back to Electron app
        socket.send(JSON.stringify({
          action: 'geminiResult',
          result: result
        }));
      }
    } catch (error) {
      console.error('Error processing message:', error);
      socket.send(JSON.stringify({
        action: 'error',
        error: error.toString()
      }));
    }
  };
  
  socket.onclose = () => {
    console.log('WebSocket connection closed');
    
    // Attempt to reconnect
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
      setTimeout(connectWebSocket, 2000);
    }
  };
  
  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

// Initial connection
connectWebSocket();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkConnection') {
    sendResponse({
      connected: socket && socket.readyState === WebSocket.OPEN
    });
  }
  return true;
});

// Main function to process screenshot with Gemini
async function processScreenshot(screenshotBase64, prompt) {
  try {
    // Find existing Gemini tab or create a new one
    let geminiTab = await findGeminiTab();
    
    if (!geminiTab) {
      geminiTab = await chrome.tabs.create({
        url: 'https://gemini.google.com/',
        active: false // Keep it in the background
      });
      
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 3000));
      geminiTab = await findGeminiTab(); // Refresh tab info
    }
    
    // Store the screenshot data in local storage
    await chrome.storage.local.set({
      currentScreenshot: screenshotBase64,
      currentPrompt: prompt || "Analyze this image"
    });
    
    // Send message to content script to process the image
    const response = await chrome.tabs.sendMessage(geminiTab.id, {
      action: 'processImage'
    });
    
    return response.result;
  } catch (error) {
    console.error('Error processing screenshot:', error);
    throw error;
  }
}

// Helper function to find an open Gemini tab
async function findGeminiTab() {
  const tabs = await chrome.tabs.query({url: "https://gemini.google.com/*"});
  return tabs.length > 0 ? tabs[0] : null;
}