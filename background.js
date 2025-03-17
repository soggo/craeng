// Set up WebSocket connection to Electron app
let socket = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let heartbeatInterval = null;

function connectWebSocket() {
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
    console.log('WebSocket already connected or connecting');
    return;
  }
  
  socket = new WebSocket('ws://localhost:8765');
  
  socket.onopen = () => {
    console.log('Connected to Electron app');
    reconnectAttempts = 0;
    
    // Set up heartbeat to keep connection alive
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    
    heartbeatInterval = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'heartbeat' }));
      }
    }, 5000); // Send heartbeat every 5 seconds
  };
  
  socket.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data);
      
      // Don't log heartbeat acknowledgements to reduce console noise
      if (message.action !== 'heartbeat-ack') {
        console.log('Received message from Electron app:', message);
      }
      
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
    
    // Clear heartbeat interval
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    
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
// Initial connection with delay to ensure extension is fully loaded
setTimeout(connectWebSocket, 1000);

// Also add this event listener at the bottom of the file
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed, connecting WebSocket');
  connectWebSocket();
});

// When the extension is unloading, clean up
chrome.runtime.onSuspend.addListener(() => {
  console.log('Extension suspending, cleaning up');
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.close();
  }
});

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
    console.log('Starting to process screenshot');
    
    // Find existing Gemini tab or create a new one
    let geminiTab = await findGeminiTab();
    console.log('Gemini tab status:', geminiTab ? 'Found' : 'Not found');
    
    if (!geminiTab) {
      console.log('Creating new Gemini tab');
      geminiTab = await chrome.tabs.create({
        url: 'https://gemini.google.com/',
        active: false // Keep it in the background
      });
      
      // Wait for page to load
      console.log('Waiting for Gemini tab to load');
      await new Promise(resolve => setTimeout(resolve, 5000)); // Increased timeout
      geminiTab = await findGeminiTab(); // Refresh tab info
      console.log('Gemini tab after waiting:', geminiTab);
    }
    
    // Store the screenshot data in local storage
    console.log('Storing screenshot in local storage');
    await chrome.storage.local.set({
      currentScreenshot: screenshotBase64,
      currentPrompt: prompt || "Analyze this image"
    });
    
    // Send message to content script to process the image
    console.log('Sending message to content script');
    const response = await chrome.tabs.sendMessage(geminiTab.id, {
      action: 'processImage'
    });
    
    console.log('Response from content script:', response);
    return response.result;
  } catch (error) {
    console.error('Error processing screenshot:', error);
    throw error;
  }
}

// Helper function to find an open Gemini tab
async function findGeminiTab() {
  const tabs = await chrome.tabs.query({url: "https://gemini.google.com/*"});
  
  if (tabs.length > 0) {
    // Ensure content script is injected
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['content.js']
      });
    } catch (error) {
      console.error('Error injecting content script:', error);
    }
    return tabs[0];
  }
  
  return null;
}