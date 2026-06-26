#!/usr/bin/env python3
"""
点击"租约欠款"筛选按钮，然后提取所有欠费房间号
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
            else:
                print("⚠️  未找到'租约欠款'筛选按钮")
            
            # 截图筛选后的页面
            await page.screenshot(path="filtered_arrears_page.png", full_page=True)
            print("📸 筛选后页面截图: filtered_arrears_page.png")
            
            # 8. 提取所有房间号
            print("🔍 提取欠费房间号...")
            
            # 方法1：查找所有房间卡片
            # 通常房间号在卡片左上角，格式为数字（如101, 202等）
            room_cards = await page.locator('[class*="room"], [class*="card"], [class*="item"]').all()
            
            arrears_rooms = set()
            
            # 尝试从页面文本中提取房间号
            page_text = await page.text_content("body")
            
            # 查找所有3位数字（房间号通常是3位数）
            room_numbers = re.findall(r'\b(\d{3})\b', page_text)
            
            # 过滤出合理的房间号（通常在100-999之间）
            for num in room_numbers:
                if 100 <= int(num) <= 999:
                    arrears_rooms.add(num)
            
            # 方法2：查找特定元素
            # 查找包含"欠"文本的元素，然后向上查找房间号
            arrears_elements = await page.locator('text=/欠/').all()
            
            for element in arrears_elements:
                try:
                    # 获取父元素链
                    parent = element
                    for _ in range(5):  # 向上查找5层
                        parent = parent.locator("xpath=..")
                        parent_text = await parent.text_content()
                        
                        # 查找房间号
                        room_match = re.search(r'\b(\d{3})\b', parent_text)
                        if room_match:
                            arrears_rooms.add(room_match.group(1))
                            break
                except:
                    continue
            
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
                with open("arrears_rooms_v2.txt", "w", encoding="utf-8") as f:
                    f.write("欠费房间列表\n")
                    f.write("="*30 + "\n")
                    for room in sorted_rooms:
                        f.write(f"房间 {room}\n")
                
                print(f"\n📄 结果已保存到: arrears_rooms_v2.txt")
            else:
                print("✅ 未发现欠费房间")
            
        except Exception as e:
            print(f"❌ 发生错误: {e}")
            await page.screenshot(path="error_screenshot_v2.png", full_page=True)
            
        finally:
            await browser.close()
            print("🏁 浏览器已关闭")

if __name__ == "__main__":
    asyncio.run(main())