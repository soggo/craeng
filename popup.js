document.addEventListener('DOMContentLoaded', function() {
    const statusElement = document.getElementById('connectionStatus');
    const openGeminiButton = document.getElementById('openGemini');
    
    // Check if background script is connected to WebSocket
    chrome.runtime.sendMessage({action: 'checkConnection'}, function(response) {
      if (response && response.connected) {
        statusElement.textContent = 'Connected to Electron app';
        statusElement.classList.add('connected');
        statusElement.classList.remove('disconnected');
      } else {
        statusElement.textContent = 'Disconnected from Electron app';
        statusElement.classList.add('disconnected');
        statusElement.classList.remove('connected');
      }
    });
    
    // Open Gemini button click event
    openGeminiButton.addEventListener('click', function() {
      chrome.tabs.create({url: 'https://gemini.google.com/'});
    });
  });