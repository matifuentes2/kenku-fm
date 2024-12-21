import { app, BrowserWindow } from 'electron';
import pie from 'puppeteer-in-electron';
import * as puppeteer from 'puppeteer-core';
import { Browser, Page } from 'puppeteer-core';

export class PuppeteerManager {
  private browser: Browser | null = null;
  private static instance: PuppeteerManager;

  private constructor() {}

  public static getInstance(): PuppeteerManager {
    if (!PuppeteerManager.instance) {
      PuppeteerManager.instance = new PuppeteerManager();
    }
    return PuppeteerManager.instance;
  }

  public async initialize(): Promise<void> {
    try {
      this.browser = await pie.connect(app, puppeteer as any);
      console.log('PuppeteerManager connected successfully');
    } catch (error) {
      console.error('Failed to connect PuppeteerManager:', error);
      throw error;
    }
  }

  public isInitialized(): boolean {
    return this.browser !== null;
  }

  public async getPage(window: BrowserWindow): Promise<Page | null> {
    if (!this.browser) {
      console.error('Browser not initialized');
      return null;
    }

    try {
      return await pie.getPage(this.browser, window);
    } catch (error) {
      console.error('Failed to get page:', error);
      return null;
    }
  }

  public async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.disconnect();
      this.browser = null;
    }
  }

  public async automateWindow(window: BrowserWindow, actions: (page: Page) => Promise<void>): Promise<void> {
    const page = await this.getPage(window);
    if (page) {
      try {
        await actions(page);
      } catch (error) {
        console.error('Failed to execute automation actions:', error);
        throw error;
      }
    }
  }
}