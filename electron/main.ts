import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import Store from 'electron-store'

const store = new Store()

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'BeatMaker'
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('store:get', (_, key: string) => {
  return store.get(key)
})

ipcMain.handle('store:set', (_, key: string, value: any) => {
  store.set(key, value)
})

ipcMain.handle('dialog:save', async (_, data: string, defaultName: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: defaultName,
    filters: [{ name: 'BeatMaker Project', extensions: ['beatmaker'] }]
  })
  if (!result.canceled && result.filePath) {
    return result.filePath
  }
  return null
})

ipcMain.handle('dialog:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    filters: [{ name: 'BeatMaker Project', extensions: ['beatmaker'] }],
    properties: ['openFile']
  })
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]
  }
  return null
})

ipcMain.handle('file:write', async (_, filePath: string, data: string) => {
  const fs = await import('fs/promises')
  await fs.writeFile(filePath, data, 'utf-8')
})

ipcMain.handle('file:read', async (_, filePath: string) => {
  const fs = await import('fs/promises')
  return await fs.readFile(filePath, 'utf-8')
})