import { Page, Locator } from '@playwright/test';

/**
 * Page Object Model: Login Page
 */
export class LoginPage {
  readonly page: Page;
  readonly usernameInput: Locator;
  readonly passwordInput: Locator;
  readonly rememberMeCheckbox: Locator;
  readonly signInButton: Locator;
  readonly errorMessage: Locator;
  readonly logo: Locator;

  constructor(page: Page) {
    this.page = page;
    this.usernameInput = page.getByRole('textbox', { name: /username/i });
    this.passwordInput = page.getByRole('textbox', { name: /password/i });
    this.rememberMeCheckbox = page.getByRole('checkbox', { name: /remember me/i });
    this.signInButton = page.getByRole('button', { name: /sign in/i });
    this.errorMessage = page.getByRole('alert');
    this.logo = page.getByRole('heading', { name: /aquaguard/i });
  }

  async goto() {
    await this.page.goto('/login');
  }

  async login(username: string, password: string, rememberMe = false) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    if (rememberMe) {
      await this.rememberMeCheckbox.check();
    }
    await this.signInButton.click();
  }

  async expectErrorMessage(text: string | RegExp) {
    await this.errorMessage.waitFor({ state: 'visible' });
    if (typeof text === 'string') {
      await this.page.getByText(text).waitFor({ state: 'visible' });
    }
  }

  async isLoaded() {
    await this.logo.waitFor({ state: 'visible' });
    await this.usernameInput.waitFor({ state: 'visible' });
    await this.passwordInput.waitFor({ state: 'visible' });
  }
}
