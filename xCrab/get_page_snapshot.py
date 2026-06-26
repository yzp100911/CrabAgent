#!/usr/bin/env python3
"""
获取页面快照，分析DOM结构
"""

import asyncio
from playwright.async_api import async_playwright

# 登录信息
LOGIN_URL = "https://gez.dongguanbank.cn/landlord/#/house/index"
USERNAME = "YOUR_USERNAME"
PASSWORD = "YOUR_PASSWORD"

async def main():
    print("🚀 启动浏览器...")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            channel="chrome",
            args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        
        page = await context.new_page()
        
        try:
            # 1. 导航到登录页面
            print(f"🌐 导航到: {LOGIN_URL}")
            await page.goto(LOGIN_URL, timeout=30000)
            await page.wait_for_load_state("networkidle")
            
            # 2. 处理弹窗
            try:
                agree_button = page.get_by_text("同意并授权")
                if await agree_button.count() > 0:
                    print("✅ 点击'同意并授权'按钮...")
                    await agree_button.click()
                    await page.wait_for_timeout(2000)
            except:
                pass
            
            # 3. 输入登录信息
            print("🔑 输入登录信息...")
            username_input = page.locator('input[placeholder*="手机号"], input[placeholder*="用户名"], input[type="text"]').first
            await username_input.fill(USERNAME)
            
            password_input = page.locator('input[placeholder*="密码"], input[type="password"]').first
            await password_input.fill(PASSWORD)
            
            # 4. 勾选协议
            try:
                checkbox = page.locator('input[type="checkbox"], .el-checkbox__input').first
                if await checkbox.count() > 0:
                    await checkbox.click()
                else:
                    agreement_text = page.get_by_text("登录即代表同意")
                    if await agreement_text.count() > 0:
                        await agreement_text.click()
            except:
                pass
            
            # 5. 点击登录
            print("🚪 点击登录按钮...")
            login_button = page.get_by_role("button", name="登录")
            if await login_button.count() > 0:
                await login_button.click()
            else:
                login_button = page.locator('button:has-text("登录")').first
                await login_button.click()
            
            await page.wait_for_timeout(3000)
            await page.wait_for_load_state("networkidle")
            
            # 6. 点击"房源"菜单
            print("🏠 点击'房源'菜单...")
            house_menu = page.get_by_text("房源")
            if await house_menu.count() > 0:
                await house_menu.first.click()
                await page.wait_for_timeout(2000)
                await page.wait_for_load_state("networkidle")
            
            # 7. 点击"租约欠款"筛选按钮
            print("🔍 点击'租约欠款'筛选按钮...")
            arrears_filter = page.get_by_text("租约欠款")
            if await arrears_filter.count() > 0:
                await arrears_filter.first.click()
                await page.wait_for_timeout(2000)
                await page.wait_for_load_state("networkidle")
                print("✅ 已点击'租约欠款'筛选按钮")
            
            # 8. 获取页面快照
            print("📸 获取页面快照...")
            
            # 获取页面HTML
            html_content = await page.content()
            
            # 保存HTML到文件
            with open("page_snapshot.html", "w", encoding="utf-8") as f:
                f.write(html_content)
            
            print("📄 页面HTML已保存到: page_snapshot.html")
            
            # 9. 查找房间卡片元素
            print("🔍 查找房间卡片元素...")
            
            # 尝试不同的选择器
            selectors = [
                '[class*="room"]',
                '[class*="card"]',
                '[class*="item"]',
                '[class*="house"]',
                '[class*="unit"]',
                '.el-card',
                '.room-card',
                '.house-item'
            ]
            
            for selector in selectors:
                elements = await page.locator(selector).all()
                if elements:
                    print(f"✅ 选择器 '{selector}' 找到 {len(elements)} 个元素")
                    
                    # 获取第一个元素的文本
                    if len(elements) > 0:
                        first_text = await elements[0].text_content()
                        print(f"  第一个元素文本: {first_text[:100]}...")
                else:
                    print(f"❌ 选择器 '{selector}' 未找到元素")
            
            # 10. 截图
            await page.screenshot(path="snapshot_page.png", full_page=True)
            print("📸 页面截图: snapshot_page.png")
            
        except Exception as e:
            print(f"❌ 发生错误: {e}")
            await page.screenshot(path="error_snapshot.png", full_page=True)
            
        finally:
            await browser.close()
            print("🏁 浏览器已关闭")

if __name__ == "__main__":
    asyncio.run(main())