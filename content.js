// Wait for response to complete
// Helper function to wait for response to complete
function waitForResponseComplete(timeout = 60000) {
  return new Promise((resolve, reject) => {
    // Check for thinking/loading indicators
    const checkComplete = () => {
      const thinkingIndicator = document.querySelector('[data-thinking="true"], .loading-indicator, .thinking');
      
      // If there's still a thinking indicator, continue waiting
      if (thinkingIndicator) {
        return false;
      }
      
      // Make sure response is present
      const responseElement = document.querySelector(
        '[role="listitem"][data-participant-type="model"], .model-response, .response-content'
      );
      
      if (!responseElement) {
        return false;
      }
      
      // Wait a bit longer to ensure response is fully rendered  
      setTimeout(resolve, 2000);
      return true;
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
      const responseElement = document.querySelector(
        '[role="listitem"][data-participant-type="model"], .model-response, .response-content'
      );
      
      if (responseElement) {
        // If response is present but we timed out waiting for completion,
        // still return what we have
        resolve();
      } else {
        reject(new Error('Timeout waiting for response to complete'));
      }
    }, timeout);
  });
}

// At the end of processImageWithGemini function, modify the response capture:
// Wait for response to appear
const responseSelector = '[role="listitem"][data-participant-type="model"], .model-response, .response-content';
await waitForElement(responseSelector, 30000); // Increased timeout

// Wait for response to complete
await waitForResponseComplete();

// Capture the response
const responseElement = document.querySelector(`${responseSelector}`);
let responseText = '';

if (responseElement) {
  // Try to find the actual text content - Gemini's UI might have changed
  const textContainer = responseElement.querySelector('.text-message-content, .message-content, [data-message-id]') || responseElement;
  responseText = textContainer.innerText || textContainer.textContent;
  
  // Log the response for debugging
  console.log('Captured response:', responseText.substring(0, 100) + '...');
}

// Return the captured response
return {
  text: responseText,
  html: responseElement ? responseElement.innerHTML : ''
};