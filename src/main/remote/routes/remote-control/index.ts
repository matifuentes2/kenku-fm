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
  // Get all window IDs
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

  // Execute actions on a specific window
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

      // Get the session manager for this window
      const sessionManager = (window as any).sessionManager as SessionManager;
      if (!sessionManager) {
        reply.code(500);
        return { error: 'Session manager not found' };
      }

      await puppeteerManager.automateWindow(window, async (page) => {
        for (const action of actions) {
          switch (action.type) {
            case 'loadURL':
              if (action.url && action.viewId !== undefined) {
                // First ensure the view exists and is visible
                const view = sessionManager.viewManager.views[action.viewId];
                if (view) {
                  // Show the view if it's hidden
                  sessionManager.viewManager.showBrowserView(action.viewId);
                  
                  // Load the URL
                  view.webContents.loadURL(action.url);
                  
                  // Wait for the page to finish loading
                  await new Promise((resolve) => {
                    const loadHandler = () => {
                      view.webContents.removeListener('did-finish-load', loadHandler);
                      resolve(true);
                    };
                    view.webContents.on('did-finish-load', loadHandler);
                    
                    // Timeout after 30 seconds
                    setTimeout(() => {
                      view.webContents.removeListener('did-finish-load', loadHandler);
                      resolve(false);
                    }, 30000);
                  });
                } else {
                  // If view doesn't exist, create it
                  const newViewId = sessionManager.viewManager.createBrowserView(
                    action.url,
                    0,  // x
                    0,  // y
                    window.getBounds().width,  // width
                    window.getBounds().height  // height
                  );
                  
                  // Wait for the page to finish loading
                  await new Promise((resolve) => {
                    const view = sessionManager.viewManager.views[newViewId];
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
                      if (view.webContents) {
                        view.webContents.removeListener('did-finish-load', loadHandler);
                      }
                      resolve(false);
                    }, 30000);
                  });
                }
              }
              break;
            case 'click':
              if (action.viewId !== undefined) {
                const view = sessionManager.viewManager.views[action.viewId];
                if (view) {
                  const viewPage = await puppeteerManager.getPage(window);
                  if (viewPage) {
                    await viewPage.click(action.selector!);
                  }
                }
              }
              break;
            case 'type':
              if (action.viewId !== undefined) {
                const view = sessionManager.viewManager.views[action.viewId];
                if (view) {
                  const viewPage = await puppeteerManager.getPage(window);
                  if (viewPage) {
                    await viewPage.type(action.selector!, action.text!);
                  }
                }
              }
              break;
            case 'evaluate':
              if (action.viewId !== undefined) {
                const view = sessionManager.viewManager.views[action.viewId];
                if (view) {
                  const viewPage = await puppeteerManager.getPage(window);
                  if (viewPage) {
                    await viewPage.evaluate(action.script!);
                  }
                }
              }
              break;
            case 'waitForSelector':
              if (action.viewId !== undefined) {
                const view = sessionManager.viewManager.views[action.viewId];
                if (view) {
                  const viewPage = await puppeteerManager.getPage(window);
                  if (viewPage) {
                    await viewPage.waitForSelector(action.selector!);
                  }
                }
              }
              break;
            default:
              throw new Error(`Unknown action type: ${(action as any).type}`);
          }
        }
      });
      return { success: true };
    } catch (error) {
      reply.code(500);
      return { error: error.message };
    }
  });
}