const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './',
  use: {
    headless: false,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
  },
  reporter: 'list',
  timeout: 120000,
  expect: {
    timeout: 60000,
  },
}); 