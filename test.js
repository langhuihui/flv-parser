const { test, expect } = require('@playwright/test');
const path = require('path');

test('check filepositions element', async ({ page }) => {
  // 获取 index.html 的绝对路径
  const htmlPath = path.join(__dirname, 'index.html');

  // 访问页面
  await page.goto(`file://${htmlPath}`);

  // 等待文件输入元素出现
  await page.waitForSelector('#file-input');

  // 检查 filepositions 元素是否存在
  const filepositionsDiv = await page.$('#filepositions');
  console.log('Filepositions div:', filepositionsDiv ? 'exists' : 'not found');

  // 检查 keyframe-info 元素是否存在
  const keyframeInfo = await page.$('#keyframe-info');
  console.log('Keyframe info div:', keyframeInfo ? 'exists' : 'not found');

  // 检查它们的可见性
  if (filepositionsDiv) {
    const isHidden = await filepositionsDiv.evaluate(el => {
      const style = window.getComputedStyle(el);
      return style.display === 'none';
    });
    console.log('Filepositions visibility:', isHidden ? 'hidden' : 'visible');
  }

  if (keyframeInfo) {
    const isHidden = await keyframeInfo.evaluate(el => {
      const style = window.getComputedStyle(el);
      return style.display === 'none';
    });
    console.log('Keyframe info visibility:', isHidden ? 'hidden' : 'visible');
  }

  // 检查 DOM 结构
  const html = await page.content();
  console.log('Page HTML:', html);
}); 