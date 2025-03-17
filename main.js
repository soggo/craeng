const { app, BrowserWindow, globalShortcut, screen } = require('electron');
const path = require('path');
const screenshot = require('screenshot-desktop');
const fs = require('fs');
const wsServer = require('./websocket-server');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

let mainWindow;
let screenshots = [];
let multiPageMode =