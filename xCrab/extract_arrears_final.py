#!/usr/bin/env python3
"""
使用[class*="card"]选择器提取欠费房间号
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
            
            # 8. 提取房间卡片
            print("🔍 提取房间卡片...")
            
            # 使用[class*="card"]选择器
            card_elements = await page.locator('[class*="card"]').all()
            print(f"📋 找到 {len(card_elements)} 个卡片元素")
            
            arrears_rooms = []
            
            for i, card in enumerate(card_elements):
                try:
                    # 获取卡片文本
                    card_text = await card.text_content()
                    
                    # 检查是否包含"欠"文本
                    if "欠" in card_text:
                        # 提取房间号（3位数字）
                        room_match = re.search(r'\b(\d{3})\b', card_text)
                        if room_match:
                            room_number = room_match.group(1)
                            arrears_rooms.append(room_number)
                            print(f"  房间 {room_number}: 包含欠费信息")
                except Exception as e:
                    print(f"  ⚠️  处理卡片 {i} 时出错: {e}")
            
            # 9. 输出结果
            print("\n" + "="*50)
            print("📊 欠费房间查询结果")
            print("="*50)
            
            if arrears_rooms:
                # 去重并排序
                unique_rooms = sorted(set(arrears_rooms))
                print(f"🏠 发现 {len(unique_rooms)} 间欠费房间:")
                for room in unique_rooms:
                    print(f"  • 房间 {room}")
                
                # 保存结果
                with open("arrears_rooms_final.txt", "w", encoding="utf-8") as f:
                    f.write("欠费房间列表\n")
                    f.write("="*30 + "\n")
                    for room in unique_rooms:
                        f.write(f"房间 {room}\n")
                
                print(f"\n📄 结果已保存到: arrears_rooms_final.txt")
            else:
                print("✅ 未发现欠费房间")
            
            # 10. 截图最终页面
            await page.screenshot(path="final_card_page.png", full_page=True)
            print("📸 最终页面截图: final_card_page.png")
            
        except Exception as e:
            print(f"❌ 发生错误: {e}")
            await page.screenshot(path="error_card.png", full_page=True)
            
        finally:
            await browser.close()
            print("🏁 浏览器已关闭")

if __name__ == "__main__":
    asyncio.run(main())