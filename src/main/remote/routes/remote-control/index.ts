// src/main/remote/routes/remote-control/index.ts
import { FastifyInstance } from 'fastify';
import { BrowserWindow } from 'electron';
import { PuppeteerManager } from '../../../managers/PuppeteerManager';
import { SessionManager } from '../../../managers/SessionManager';

interface ExecuteActionBody {
  actions: {
    type: 'click' | 'type' | 'evaluate' | 'waitForSelector' | 'loadURL';
    selector?: string;
    text?: string;
    script?: string;
    url?: string;
    viewId?: number;
  }[];
}

export default async function remoteControlRoutes(fastify: FastifyInstance) {
  // Get all window IDs and their views
  fastify.get('/windows', async (request, reply) => {
    const windows = BrowserWindow.getAllWindows();
    return {
      windows: windows.map(win => ({
        id: win.id,
        title: win.getTitle(),
        url: win.webContents.getURL(),
        views: win.getBrowserViews().map(view => ({
          id: view.webContents.id,
          url: view.webContents.getURL()
        }))
      }))
    };
  });

  // Simple loadURL endpoint
  fastify.post('/load-url', async (request, reply) => {
    try {
      const { url, windowId } = request.body as { url: string; windowId?: number };
      
      // Get the first window if windowId not specified
      const window = windowId ? 
        BrowserWindow.getAllWindows().find(win => win.id === windowId) :
        BrowserWindow.getAllWindows()[0];
        
      if (!window) {
        reply.code(404);
        return { error: 'Window not found' };
      }

      const sessionManager = (window as any).sessionManager as SessionManager;
      if (!sessionManager) {
        reply.code(500);
        return { error: 'Session manager not found' };
      }

      // Create a new browser view
      const viewId = sessionManager.viewManager.createBrowserView(
        url,
        0,  // x
        0,  // y
        window.getBounds().width,
        window.getBounds().height
      );

      // Wait for the page to load
      await new Promise((resolve) => {
        const view = sessionManager.viewManager.views[viewId];
        if (!view) {
          resolve(false);
          return;
        }

        const loadHandler = () => {
          view.webContents.removeListener('did-finish-load', loadHandler);
          resolve(true);
        };
        view.webContents.on('did-finish-load', loadHandler);

        // Timeout after 30 seconds
        setTimeout(() => {
          if (view?.webContents) {
            view.webContents.removeListener('did-finish-load', loadHandler);
          }
          resolve(false);
        }, 30000);
      });

      return { success: true, viewId };
    } catch (error) {
      console.error('Error loading URL:', error);
      reply.code(500);
      return { error: error.message };
    }
  });

  // Execute complex actions on a specific window
  fastify.post<{
    Params: { windowId: string };
    Body: ExecuteActionBody;
  }>('/windows/:windowId/execute', async (request, reply) => {
    const { windowId } = request.params;
    const { actions } = request.body;

    const window = BrowserWindow.getAllWindows().find(win => win.id === parseInt(windowId));
    if (!window) {
      reply.code(404);
      return { error: 'Window not found' };
    }

    try {
      const puppeteerManager = PuppeteerManager.getInstance();
      
      if (!puppeteerManager.isInitialized()) {
        reply.code(500);
        return { error: 'Puppeteer is not initialized' };
      }

      const sessionManager = (window as any).sessionManager as SessionManager;
      if (!sessionManager) {
        reply.code(500);
        return { error: 'Session manager not found' };
      }

      for (const action of actions) {
        if (action.type === 'loadURL') {
          if (action.url) {
            let viewId = action.viewId;
            
            // If no viewId specified or view doesn't exist, create a new one
            if (!viewId || !sessionManager.viewManager.views[viewId]) {
              viewId = sessionManager.viewManager.createBrowserView(
                action.url,
                0,
                0,
                window.getBounds().width,
                window.getBounds().height
              );
            } else {
              // Use existing view
              sessionManager.viewManager.showBrowserView(viewId);
              sessionManager.viewManager.loadURL(viewId, action.url);
            }

            // Wait for load
            await new Promise((resolve) => {
              const view = sessionManager.viewManager.views[viewId!];
              if (!view) {
                resolve(false);
                return;
              }

              const loadHandler = () => {
                view.webContents.removeListener('did-finish-load', loadHandler);
                resolve(true);
              };
              view.webContents.on('did-finish-load', loadHandler);

              setTimeout(() => {
                if (view?.webContents) {
                  view.webContents.removeListener('did-finish-load', loadHandler);
                }
                resolve(false);
              }, 30000);
            });
          }
          continue;
        }

        // Handle other Puppeteer actions
        await puppeteerManager.automateWindow(window, async (page) => {
          switch (action.type) {
            case 'click':
              await page.click(action.selector!);
              break;
            case 'type':
              await page.type(action.selector!, action.text!);
              break;
            case 'evaluate':
              await page.evaluate(action.script!);
              break;
            case 'waitForSelector':
              await page.waitForSelector(action.selector!);
              break;
          }
        });
      }

      return { success: true };
    } catch (error) {
      console.error('Error executing actions:', error);
      reply.code(500);
      return { error: error.message };
    }
  });
}