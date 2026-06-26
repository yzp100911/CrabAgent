#!/usr/bin/env python3
"""
提取所有欠费房间号
滚动页面并查找所有带"欠"标签的房间
"""

import asyncio
import re
from playwright.async_api import async_playwright

# 登录信息
LOGIN_URL = "https://gez.dongguanbank.cn/landlord/#/house/index"
USERNAME = "YOUR_USERNAME"
PASSWORD = "YOUR_PASSWORD"

async def main():
    print("🚀 启动浏览器...")
    
    async with async_playwright() as p:
        # 使用Chrome浏览器，无头模式
        browser = await p.chromium.launch(
            headless=True,
            channel="chrome",
            args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        
        # 创建上下文
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        
        # 创建页面
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
            
            print("🔍 开始查找欠费房间...")
            
            # 7. 滚动页面并查找所有欠费房间
            arrears_rooms = set()
            
            # 获取页面总高度
            page_height = await page.evaluate("document.body.scrollHeight")
            viewport_height = 1080
            current_position = 0
            
            # 滚动页面
            while current_position < page_height:
                # 滚动到当前位置
                await page.evaluate(f"window.scrollTo(0, {current_position})")
                await page.wait_for_timeout(500)
                
                # 查找当前视图中的欠费房间
                # 查找包含"欠"文本的元素
                arrears_elements = await page.locator('text=/欠/').all()
                
                for element in arrears_elements:
                    try:
                        # 获取元素文本
                        text = await element.text_content()
                        if not text:
                            continue
                        
                        # 查找房间号 - 通常在父元素或相邻元素中
                        parent = element.locator("xpath=..")
                        parent_text = await parent.text_content()
                        
                        # 提取房间号（数字）
                        room_numbers = re.findall(r'(\d{3})', parent_text)
                        if room_numbers:
                            arrears_rooms.update(room_numbers)
                            print(f"  发现欠费房间: {room_numbers}")
                    except Exception as e:
                        continue
                
                # 移动到下一屏
                current_position += viewport_height // 2  # 重叠滚动以确保不漏掉
                
                # 更新页面高度（可能动态加载）
                new_height = await page.evaluate("document.body.scrollHeight")
                if new_height > page_height:
                    page_height = new_height
            
            # 8. 输出结果
            print("\n" + "="*50)
            print("📊 欠费房间查询结果")
            print("="*50)
            
            if arrears_rooms:
                # 排序房间号
                sorted_rooms = sorted(arrears_rooms)
                print(f"🏠 发现 {len(sorted_rooms)} 间欠费房间:")
                for room in sorted_rooms:
                    print(f"  • 房间 {room}")
                
                # 保存结果到文件
                with open("arrears_rooms.txt", "w", encoding="utf-8") as f:
                    f.write("欠费房间列表\n")
                    f.write("="*30 + "\n")
                    for room in sorted_rooms:
                        f.write(f"房间 {room}\n")
                
                print(f"\n📄 结果已保存到: arrears_rooms.txt")
            else:
                print("✅ 未发现欠费房间")
            
            # 9. 截图最终页面
            await page.screenshot(path="final_arrears_page.png", full_page=True)
            print("📸 最终页面截图: final_arrears_page.png")
            
        except Exception as e:
            print(f"❌ 发生错误: {e}")
            await page.screenshot(path="error_screenshot.png", full_page=True)
            
        finally:
            await browser.close()
            print("🏁 浏览器已关闭")

if __name__ == "__main__":
    asyncio.run(main())