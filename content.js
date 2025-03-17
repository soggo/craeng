// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'processImage') {
      processImageWithGemini()
        .then(result => sendResponse({success: true, result}))
        .catch(error => sendResponse({success: false, error: error.toString()}));
      return true; // Indicates async response
    }
  });
  
  // Main function to process image with Gemini
  async function processImageWithGemini() {
    try {
      // Get the screenshot and prompt from local storage
      const { currentScreenshot, currentPrompt } = await chrome.storage.local.get([
        'currentScreenshot',
        'currentPrompt'
      ]);
      
      // Make sure we're on the main Gemini page
      if (!window.location.href.includes('gemini.google.com')) {
        throw new Error('Not on Gemini page');
      }
      
      // Wait for Gemini UI to be fully loaded
      await waitForElement('[aria-label="Add image"], button[aria-label="Add image"]');
      
      // Click the add image button
      const addImageButton = document.querySelector('[aria-label="Add image"], button[aria-label="Add image"]');
      addImageButton.click();
      
      // Wait for file input to appear
      await waitForElement('input[type="file"]');
      
      // Convert base64 to Blob
      const blob = await base64ToBlob(currentScreenshot);
      const file = new File([blob], 'screenshot.png', {type: 'image/png'});
      
      // Create a DataTransfer object and add the file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      
      // Get the file input and set its files
      const fileInput = document.querySelector('input[type="file"]');
      fileInput.files = dataTransfer.files;
      
      // Dispatch change event to trigger file upload
      fileInput.dispatchEvent(new Event('change', {bubbles: true}));
      
      // Wait for image to be uploaded (look for the preview)
      await waitForElement('img[alt="Uploaded image"], .image-preview img');
      
      // Enter prompt text
      const promptInput = document.querySelector('[role="textbox"], textarea');
      
      // Clear any existing content
      promptInput.innerHTML = '';
      
      // Insert the prompt text
      promptInput.innerHTML = currentPrompt;
      promptInput.dispatchEvent(new Event('input', {bubbles: true}));
      
      // Find and click send button
      const sendButton = document.querySelector('button[aria-label="Send message"], button[aria-label="Submit"]');
      sendButton.click();
      
      // Wait for response to appear
      const responseSelector = '[role="listitem"][data-participant-type="model"], .model-response, .response-content';
      await waitForElement(responseSelector);
      
      // Wait for response to complete
      await waitForResponseComplete();
      
      // Extract the response text
      const responseElement = document.querySelector(`${responseSelector} [data-message-id], ${responseSelector} .message-content`);
      return responseElement.innerText;
    } catch (error) {
      console.error('Error processing with Gemini:', error);
      throw error;
    }
  }
  
  // Helper function to convert base64 to Blob
  function base64ToBlob(base64) {
    const parts = base64.split(';base64,');
    const contentType = parts[0].includes(':') ? parts[0].split(':')[1] : 'image/png';
    const raw = window.atob(parts.length > 1 ? parts[1] : base64);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    
    for (let i = 0; i < rawLength; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    
    return new Blob([uInt8Array], {type: contentType});
  }
  
  // Helper function to wait for an element to appear in DOM
  function waitForElement(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(selector)) {
        return resolve(document.querySelector(selector));
      }
      
      const observer = new MutationObserver((mutations) => {
        if (document.querySelector(selector)) {
          observer.disconnect();
          resolve(document.querySelector(selector));
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true
      });
      
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for element: ${selector}`));
      }, timeout);
    });
  }
  
  // Helper function to wait for response to be complete
  function waitForResponseComplete(timeout = 60000) {
    return new Promise((resolve, reject) => {
      // Check for thinking/loading indicators
      const checkComplete = () => {
        const thinkingIndicator = document.querySelector('[data-thinking="true"], .loading-indicator, .thinking');
        if (!thinkingIndicator) {
          // Wait a bit longer to ensure response is fully rendered
          setTimeout(resolve, 1000);
          return true;
        }
        return false;
      };
      
      // Check immediately
      if (checkComplete()) return;
      
      // Otherwise observe DOM changes
      const observer = new MutationObserver(() => {
        if (checkComplete()) {
          observer.disconnect();
        }
      });
      
      observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true
      });
      
      // Set timeout
      setTimeout(() => {
        observer.disconnect();
        reject(new Error('Timeout waiting for response to complete'));
      }, timeout);
    });
  }