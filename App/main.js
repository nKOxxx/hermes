const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backend;

function startBackend() {
    const serverPath = path.join(__dirname, 'backend', 'server.js');
    backend = spawn('node', [serverPath], {
        stdio: 'inherit',
        detached: true
    });
    backend.on('error', err => console.error('[main] Backend error:', err));
    backend.on('exit', code => console.log('[main] Backend exited:', code));
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 800,
        minWidth: 1000,
        minHeight: 600,
        title: '⚡ ARES Agent',
        backgroundColor: '#09090b'
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
    startBackend();
    setTimeout(createWindow, 1500);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
    if (backend) {
        try { process.kill(backend.pid); } catch(e) {}
    }
});
