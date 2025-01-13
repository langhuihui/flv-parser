const { test, expect } = require('@playwright/test');
const path = require('path');

test('check filepositions element', async ({ page }) => {
  try {
    // 获取 index.html 的绝对路径
    const htmlPath = path.join(__dirname, 'index.html');
    console.log('HTML path:', htmlPath);

    // 访问页面
    await page.goto(`file://${htmlPath}`);
    console.log('Page loaded');

    // 监听控制台消息
    let progress = 0;
    let hasKeyframePositions = false;
    let keyframePositionsLength = 0;

    page.on('console', async msg => {
      const text = msg.text();
      if (text.startsWith('Progress callback:')) {
        try {
          // Extract the object literal from the string and parse it
          const match = text.match(/\{.*\}/);
          if (match) {
            const data = JSON.parse(match[0]);
            console.log('Progress data:', data);
            if (data.hasKeyframePositions) {
              hasKeyframePositions = true;
            }
          }
        } catch (e) {
          console.error('Error parsing progress data:', e);
        }
      }

      // 记录关键的调试信息
      if (text.includes('Found keyframe positions:')) {
        console.log('Keyframe positions found event triggered');
      }
      if (text.includes('Updating filepositions display')) {
        console.log('Filepositions display update triggered');
      }
      if (text.includes('No keyframe positions to display')) {
        console.log('Warning: No keyframe positions available');
      }
    });

    // 直接使用 setInputFiles 设置文件
    const input = await page.locator('#file-input');
    await input.setInputFiles('/Users/dexter/project/v5/monibuca/example/default/record/live/1581F6Q8X24BT00G01GA/1736230864.flv');
    console.log('File set to input');

    // 等待进度超过 15%,最多等待 30 秒
    for (let i = 0; i < 60; i++) {
      console.log('Current progress:', progress);
      console.log('Keyframe positions status:', { hasKeyframePositions, keyframePositionsLength });

      if (progress > 15) {
        console.log('Progress exceeded 15%, proceeding with checks');
        break;
      }
      await page.waitForTimeout(500);  // 每次等待 500ms
    }

    // 如果进度仍未超过 15%,输出警告
    if (progress <= 15) {
      console.log('Warning: Progress did not exceed 15% within timeout');
    }

    // 等待 keyframe-info 元素变为可见
    await page.waitForSelector('#keyframe-info', { state: 'visible', timeout: 5000 })
      .catch(() => console.log('Keyframe info element did not become visible'));

    // 检查 filepositions 元素
    const filepositionsDiv = await page.$('#filepositions');
    if (filepositionsDiv) {
      const content = await filepositionsDiv.evaluate(el => el.innerHTML);
      console.log('Found filepositions content:', content);

      // 检查内容是否为空
      if (!content.trim()) {
        console.log('Warning: Filepositions content is empty');
      }
    } else {
      console.log('Error: Filepositions element not found');
    }

    // 等待一段时间以确保所有更新都完成
    await page.waitForTimeout(2000);

    // 再次检查 filepositions 内容
    const finalContent = await filepositionsDiv?.evaluate(el => el.innerHTML);
    console.log('Final filepositions content:', finalContent);

  } catch (error) {
    console.error('Test error:', error);
    throw error;
  }
}); 