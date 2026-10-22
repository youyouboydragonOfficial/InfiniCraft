const { app, BrowserWindow, protocol, net, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const argv = process.argv;
const arg = (name) => { const a = argv.find((x) => x.startsWith('--' + name + '=')); return a ? a.slice(name.length + 3) : null; };
const DEV = argv.includes('--dev');
const SHOT = arg('shot');
const ICON_OUT = arg('icon');
const QUERY = arg('query') || '';
const DIST = path.join(__dirname, '..', 'dist');

app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

let win, allowClose = false;

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    if (!p || p === '/') p = '/index.html';
    const fp = path.normalize(path.join(DIST, p));
    if (!fp.startsWith(DIST)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(fp).toString());
  });
  Menu.setApplicationMenu(null);

  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 600, backgroundColor: '#05070c', title: 'InfiniCraft',
    icon: path.join(__dirname, '..', 'build', 'icon.png'), show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, backgroundThrottling: false },
  });
  win.once('ready-to-show', () => win.show());

  let query = '';
  if (ICON_OUT) query = '?icon=1';
  else if (SHOT) query = '?auto=1' + (QUERY ? '&' + QUERY : '');
  win.loadURL((DEV ? 'http://localhost:5173/' : 'app://game/index.html') + query);

  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.type === 'keyDown' && input.key === 'F12' && input.control) win.webContents.toggleDevTools();
  });
  win.webContents.on('console-message', (e, level, message) => {
    const m = typeof e === 'object' && e.message ? e.message : message;
    if (SHOT || DEV || ICON_OUT) console.log('[renderer]', m);
    if (SHOT && String(m).includes('AUTO_READY')) {
      const delay = parseInt(arg('delay') || '4000');
      setTimeout(async () => {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(SHOT, img.toPNG());
        console.log('saved', SHOT);
        allowClose = true; app.quit();
      }, delay);
    }
  });
  win.webContents.on('render-process-gone', (e, d) => console.log('renderer gone', d.reason));

  win.on('close', (e) => {
    if (allowClose || SHOT || ICON_OUT) return;
    e.preventDefault();
    win.webContents.send('before-close');
    setTimeout(() => { allowClose = true; win.close(); }, 4000);
  });
  if (SHOT) setTimeout(() => { console.log('timeout'); allowClose = true; app.quit(); }, 120000);
});

ipcMain.on('close-ok', () => { allowClose = true; if (win) win.close(); });
ipcMain.on('quit', () => { if (win) win.close(); });
ipcMain.on('save-icon', (e, dataURL) => {
  if (!ICON_OUT) return;
  fs.writeFileSync(ICON_OUT, Buffer.from(dataURL.split(',')[1], 'base64'));
  allowClose = true; app.quit();
});

app.on('window-all-closed', () => app.quit());
