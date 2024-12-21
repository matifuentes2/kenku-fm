// src/main/remote/routes/remote-control/index.ts
import { FastifyInstance } from 'fastify';
import { BrowserWindow } from 'electron';
import { PuppeteerManager } from '../../../managers/PuppeteerManager';

// Define request/response types for TypeScript
interface ExecuteActionBody {
  actions: {
    type: 'click' | 'type' | 'evaluate' | 'waitForSelector';
    selector?: string;
    text?: string;
    script?: string;
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
        url: win.webContents.getURL()
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
      // Use the existing PuppeteerManager instance - no initialization needed
      const puppeteerManager = PuppeteerManager.getInstance();
      
      // Check if puppeteer is ready
      if (!puppeteerManager.isInitialized()) {
        reply.code(500);
        return { error: 'Puppeteer is not initialized' };
      }

      await puppeteerManager.automateWindow(window, async (page) => {
        for (const action of actions) {
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