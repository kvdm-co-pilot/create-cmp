import fs from 'node:fs/promises';

export class AppiumClient {
  constructor({ serverUrl, capabilities }) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.capabilities = capabilities;
    this.sessionId = null;
  }

  async start() {
    const result = await this.#request('/session', {
      method: 'POST',
      body: {
        capabilities: {
          alwaysMatch: this.capabilities,
          firstMatch: [{}],
        },
      },
    });
    this.sessionId = result.sessionId ?? result.value?.sessionId;
    return this.sessionId;
  }

  async stop() {
    if (!this.sessionId) {
      return;
    }
    await this.#request(`/session/${this.sessionId}`, { method: 'DELETE' });
    this.sessionId = null;
  }

  async pause(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async back() {
    await this.#sessionRequest('/back', { method: 'POST', body: {} });
  }

  async screenshot(filePath) {
    const result = await this.#sessionRequest('/screenshot', { method: 'GET' });
    await fs.mkdir(new URL('.', `file://${filePath}`).pathname, { recursive: true }).catch(() => {});
    await fs.writeFile(filePath, Buffer.from(result.value, 'base64'));
  }

  async pageSource() {
    const result = await this.#sessionRequest('/source', { method: 'GET' });
    return result.value;
  }

  async clickByText(text, timeoutMs = 10000) {
    await this.clickByXPath(`//*[@text=${escapeXPathText(text)}]`, timeoutMs);
  }

  async clickByTextContaining(text, timeoutMs = 10000) {
    await this.clickByXPath(`//*[contains(@text,${escapeXPathText(text)})]`, timeoutMs);
  }

  async waitForTextContaining(text, timeoutMs = 10000) {
    const safeText = escapeXPathText(text);
    return this.waitForElement('xpath', `//*[contains(@text,${safeText})]`, timeoutMs);
  }

  async clickByAccessibilityId(label, timeoutMs = 10000) {
    const elementId = await this.waitForElement('accessibility id', label, timeoutMs);
    await this.clickElement(elementId);
  }

  async clickByXPath(xpath, timeoutMs = 10000) {
    const elementId = await this.waitForElement('xpath', xpath, timeoutMs);
    await this.clickElement(elementId);
  }

  async clickElement(elementId) {
    await this.#sessionRequest(`/element/${elementId}/click`, { method: 'POST', body: {} });
  }

  async waitForText(text, timeoutMs = 10000) {
    const safeText = escapeXPathText(text);
    return this.waitForElement('xpath', `//*[@text=${safeText}]`, timeoutMs);
  }

  async elementExists(using, value) {
    try {
      await this.#sessionRequest('/element', {
        method: 'POST',
        body: { using, value },
      });
      return true;
    } catch {
      return false;
    }
  }

  async typeByXPath(xpath, text, timeoutMs = 10000) {
    const elementId = await this.waitForElement('xpath', xpath, timeoutMs);
    await this.clickElement(elementId);
    await this.clearElement(elementId);
    await this.typeElement(elementId, text);
    return elementId;
  }

  async typeIntoLabeledField(label, text, timeoutMs = 10000) {
    const safeLabel = escapeXPathText(label);
    return this.typeByXPath(`//android.widget.EditText[.//android.widget.TextView[@text=${safeLabel}]]`, text, timeoutMs);
  }

  async clearElement(elementId) {
    await this.#sessionRequest(`/element/${elementId}/clear`, { method: 'POST', body: {} });
  }

  async typeElement(elementId, text) {
    await this.#sessionRequest(`/element/${elementId}/value`, {
      method: 'POST',
      body: {
        text,
        value: Array.from(text),
      },
    });
  }

  async waitForTextGone(text, timeoutMs = 10000) {
    const safeText = escapeXPathText(text);
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const exists = await this.elementExists('xpath', `//*[@text=${safeText}]`);
      if (!exists) {
        return;
      }
      await this.pause(300);
    }
    throw new Error(`Timed out waiting for text to disappear: ${text}`);
  }

  async getWindowRect() {
    const result = await this.#sessionRequest('/window/rect', { method: 'GET' });
    return result.value;
  }

  async swipe(startX, startY, endX, endY, durationMs = 350) {
    await this.#sessionRequest('/actions', {
      method: 'POST',
      body: {
        actions: [
          {
            type: 'pointer',
            id: 'finger1',
            parameters: { pointerType: 'touch' },
            actions: [
              { type: 'pointerMove', duration: 0, x: startX, y: startY },
              { type: 'pointerDown', button: 0 },
              { type: 'pause', duration: 100 },
              { type: 'pointerMove', duration: durationMs, x: endX, y: endY },
              { type: 'pointerUp', button: 0 },
            ],
          },
        ],
      },
    });
    await this.#sessionRequest('/actions', { method: 'DELETE', body: {} });
  }

  async swipeUp() {
    const rect = await this.getWindowRect();
    const midX = Math.round(rect.width / 2);
    await this.swipe(midX, Math.round(rect.height * 0.8), midX, Math.round(rect.height * 0.35));
  }

  async waitForElement(using, value, timeoutMs = 10000) {
    const startedAt = Date.now();
    let lastError = null;
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const result = await this.#sessionRequest('/element', {
          method: 'POST',
          body: { using, value },
        });
        const element = result.value;
        const elementId = element?.['element-6066-11e4-a52e-4f735466cecf'] ?? element?.ELEMENT;
        if (elementId) {
          return elementId;
        }
      } catch (error) {
        lastError = error;
      }
      await this.pause(350);
    }
    throw new Error(`Timed out waiting for element ${using}=${value}: ${lastError?.message ?? 'not found'}`);
  }

  async #sessionRequest(path, options) {
    if (!this.sessionId) {
      throw new Error('Appium session has not been started');
    }
    return this.#request(`/session/${this.sessionId}${path}`, options);
  }

  async #request(path, { method, body } = {}) {
    const response = await fetch(`${this.serverUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message = json.value?.message ?? json.error ?? text;
      throw new Error(message);
    }
    return json;
  }
}

export function escapeXPathText(text) {
  if (!text.includes("'")) {
    return `'${text}'`;
  }
  if (!text.includes('"')) {
    return `"${text}"`;
  }
  const parts = text.split("'").map((part) => `'${part}'`);
  return `concat(${parts.join(', "\'", ')})`;
}