const WebSocket = require('ws');

class WebSocketServer {
  constructor() {
    this.wss = null;
    this.clients = new Set();
    this.mainWindow = null;
  }

  initialize(mainWindow, port = 8765) {
    this.mainWindow = mainWindow;
    
    // Create WebSocket server
    this.wss = new WebSocket.Server({ port });
    
    console.log(`WebSocket server started on port ${port}`);
    
    // Handle new connections
    this.wss.on('connection', (ws) => {
      console.log('Chrome extension connected');
      this.clients.add(ws);
      
      // Handle messages from extension
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          console.log('Received from extension:', data);
          
          if (data.action === 'geminiResult') {
            // More detailed logging
            console.log('Result details:', data.result ? 'Result present' : 'No result', 
                        typeof data.result, 
                        data.result && data.result.text ? 'Has text' : 'No text');
            
            // Send result to the renderer process
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              // Check if result is present and has text
              if (data.result && data.result.text) {
                this.mainWindow.webContents.send('analysis-result', data.result.text);
              } else if (data.result) {
                // If result is a string or another primitive
                this.mainWindow.webContents.send('analysis-result', 
                  typeof data.result === 'string' ? data.result : JSON.stringify(data.result));
              } else {
                this.mainWindow.webContents.send('error', 'Received empty result from Gemini');
              }
            }
          } else if (data.action === 'error') {
            // Handle errors
            console.error('Error from extension:', data.error);
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
              this.mainWindow.webContents.send('error', data.error);
            }
          }
        } catch (error) {
          console.error('Error processing message from extension:', error);
        }
      });
      
      // Handle disconnection
      ws.on('close', () => {
        console.log('Chrome extension disconnected');
        this.clients.delete(ws);
      });
      
      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });
    
    // Handle server errors
    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });
  }

  // Send message to all connected clients (extensions)
  sendToAll(data) {
    if (!this.wss) return false;
    
    let sent = false;
    
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
        sent = true;
      }
    });
    
    return sent;
  }

  // Close the server
  close() {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
      this.clients.clear();
      console.log('WebSocket server closed');
    }
  }
}

ws.on('message', (message) => {
  try {
    const data = JSON.parse(message.toString());
    
    // Don't log heartbeats to avoid noise
    if (data.action !== 'heartbeat') {
      console.log('Received from extension:', data);
    }
    
    if (data.action === 'heartbeat') {
      // Respond to heartbeat
      ws.send(JSON.stringify({ action: 'heartbeat-ack' }));
    } else if (data.action === 'geminiResult') {
      // Handle result (existing code)
    } else if (data.action === 'error') {
      // Handle errors (existing code)
    }
  } catch (error) {
    console.error('Error processing message from extension:', error);
  }
});

module.exports = new WebSocketServer();