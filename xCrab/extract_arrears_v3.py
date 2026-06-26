#!/usr/bin/env python3
"""
滚动页面并提取所有欠费房间号
使用更精确的选择器
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
            
            # 8. 滚动页面并提取所有房间号
            print("📜 开始滚动页面...")
            
            arrears_rooms = set()
            last_height = 0
            
            while True:
                # 获取当前页面高度
                current_height = await page.evaluate("document.body.scrollHeight")
                
                # 如果页面高度没有变化，说明已经到底
                if current_height == last_height:
                    break
                
                last_height = current_height
                
                # 滚动到页面底部
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await page.wait_for_timeout(1000)
                
                # 提取当前可见的房间号
                # 查找所有可能的房间号元素
                room_elements = await page.locator('[class*="room-number"], [class*="roomNum"], [class*="number"]').all()
                
                for element in room_elements:
                    try:
                        text = await element.text_content()
                        if text:
                            # 提取3位数字
                            numbers = re.findall(r'\b(\d{3})\b', text)
                            for num in numbers:
                                if 100 <= int(num) <= 999:
                                    arrears_rooms.add(num)
                    except:
                        continue
                
                # 也从页面文本中提取
                page_text = await page.text_content("body")
                numbers = re.findall(r'\b(\d{3})\b', page_text)
                for num in numbers:
                    if 100 <= int(num) <= 999:
                        arrears_rooms.add(num)
                
                print(f"  当前找到 {len(arrears_rooms)} 个房间号")
            
            # 9. 输出结果
            print("\n" + "="*50)
            print("📊 欠费房间查询结果")
            print("="*50)
            
            if arrears_rooms:
                sorted_rooms = sorted(arrears_rooms)
                print(f"🏠 发现 {len(sorted_rooms)} 间欠费房间:")
                for room in sorted_rooms:
                    print(f"  • 房间 {room}")
                
                # 保存结果
                with open("arrears_rooms_v3.txt", "w", encoding="utf-8") as f:
                    f.write("欠费房间列表\n")
                    f.write("="*30 + "\n")
                    for room in sorted_rooms:
                        f.write(f"房间 {room}\n")
                
                print(f"\n📄 结果已保存到: arrears_rooms_v3.txt")
            else:
                print("✅ 未发现欠费房间")
            
            # 10. 截图最终页面
            await page.screenshot(path="final_scrolled_page.png", full_page=True)
            print("📸 最终页面截图: final_scrolled_page.png")
            
        except Exception as e:
            print(f"❌ 发生错误: {e}")
            await page.screenshot(path="error_screenshot_v3.png", full_page=True)
            
        finally:
            await browser.close()
            print("🏁 浏览器已关闭")

if __name__ == "__main__":
    asyncio.run(main())