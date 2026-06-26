#!/usr/bin/env python3
"""
检查莞e租系统中欠费的房间
使用Playwright自动化登录并查找欠费房间
"""

import asyncio
import json
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
            channel="chrome",  # 使用Chrome而不是Chromium
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-extensions"
            ]
        )
        
        # 创建上下文
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        
        # 创建页面
        page = await context.new_page()
        
        try:
            # 1. 导航到登录页面
            print(f"🌐 导航到: {LOGIN_URL}")
            await page.goto(LOGIN_URL, timeout=30000)
            await page.wait_for_load_state("networkidle")
            
            # 截图当前页面
            await page.screenshot(path="step1_login_page.png", full_page=True)
            print("📸 步骤1截图: step1_login_page.png")
            
            # 2. 处理可能的弹窗 - "同意并授权"
            try:
                # 查找"同意并授权"按钮
                agree_button = page.get_by_text("同意并授权")
                if await agree_button.count() > 0:
                    print("✅ 找到'同意并授权'按钮，点击...")
                    await agree_button.click()
                    await page.wait_for_timeout(2000)
                    await page.screenshot(path="step2_after_agree.png", full_page=True)
                    print("📸 步骤2截图: step2_after_agree.png")
                else:
                    print("ℹ️  未找到'同意并授权'按钮，继续...")
            except Exception as e:
                print(f"⚠️  处理弹窗时出错: {e}")
            
            # 3. 输入用户名和密码
            print("🔑 输入登录信息...")
            
            # 查找用户名输入框
            username_input = page.locator('input[placeholder*="手机号"], input[placeholder*="用户名"], input[type="text"]').first
            await username_input.fill(USERNAME)
            
            # 查找密码输入框
            password_input = page.locator('input[placeholder*="密码"], input[type="password"]').first
            await password_input.fill(PASSWORD)
            
            # 4. 勾选协议复选框
            print("☑️  勾选用户协议...")
            try:
                # 查找复选框 - 可能是checkbox或自定义样式
                checkbox = page.locator('input[type="checkbox"], .el-checkbox__input, .checkbox').first
                if await checkbox.count() > 0:
                    await checkbox.click()
                else:
                    # 尝试点击包含协议文本的元素
                    agreement_text = page.get_by_text("登录即代表同意")
                    if await agreement_text.count() > 0:
                        await agreement_text.click()
            except Exception as e:
                print(f"⚠️  勾选协议时出错: {e}")
            
            await page.screenshot(path="step3_filled_form.png", full_page=True)
            print("📸 步骤3截图: step3_filled_form.png")
            
            # 5. 点击登录按钮
            print("🚪 点击登录按钮...")
            login_button = page.get_by_role("button", name="登录")
            if await login_button.count() > 0:
                await login_button.click()
            else:
                # 尝试其他选择器
                login_button = page.locator('button:has-text("登录"), .el-button--primary:has-text("登录")').first
                await login_button.click()
            
            # 等待登录完成
            await page.wait_for_timeout(3000)
            await page.wait_for_load_state("networkidle")
            
            await page.screenshot(path="step4_after_login.png", full_page=True)
            print("📸 步骤4截图: step4_after_login.png")
            
            # 6. 点击"房源"菜单
            print("🏠 点击'房源'菜单...")
            house_menu = page.get_by_text("房源")
            if await house_menu.count() > 0:
                await house_menu.first.click()
                await page.wait_for_timeout(2000)
                await page.wait_for_load_state("networkidle")
            else:
                print("⚠️  未找到'房源'菜单")
            
            await page.screenshot(path="step5_house_page.png", full_page=True)
            print("📸 步骤5截图: step5_house_page.png")
            
            # 7. 查找欠费房间
            print("🔍 查找欠费房间...")
            
            # 获取页面内容
            page_content = await page.content()
            
            # 查找欠费相关信息 - 这里需要根据实际页面结构调整
            # 尝试查找包含"欠费"、"欠租"、"欠款"等文本的元素
            arrears_elements = await page.locator('text=/欠费|欠租|欠款|逾期|未缴/').all()
            
            arrears_rooms = []
            
            if arrears_elements:
                print(f"📋 找到 {len(arrears_elements)} 个包含欠费信息的元素")
                
                # 尝试提取房间号
                for element in arrears_elements:
                    try:
                        # 获取元素文本
                        text = await element.text_content()
                        print(f"  - 欠费信息: {text}")
                        
                        # 尝试从父元素或相邻元素获取房间号
                        # 这里需要根据实际DOM结构调整
                        parent = element.locator("xpath=..")
                        room_info = await parent.text_content()
                        
                        # 简单提取房间号（数字）
                        import re
                        room_numbers = re.findall(r'\d+', room_info)
                        if room_numbers:
                            arrears_rooms.extend(room_numbers)
                    except Exception as e:
                        print(f"  ⚠️  提取信息时出错: {e}")
            
            # 8. 输出结果
            print("\n" + "="*50)
            print("📊 欠费房间查询结果")
            print("="*50)
            
            if arrears_rooms:
                # 去重并排序
                unique_rooms = sorted(set(arrears_rooms))
                print(f"🏠 发现 {len(unique_rooms)} 间欠费房间:")
                for room in unique_rooms:
                    print(f"  • 房间 {room}")
            else:
                print("✅ 未发现欠费房间")
            
            # 9. 保存详细结果到文件
            result = {
                "timestamp": "2025-06-03",
                "total_arrears": len(arrears_rooms),
                "arrears_rooms": list(set(arrears_rooms)),
                "page_title": await page.title()
            }
            
            with open("arrears_result.json", "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            
            print(f"\n📄 详细结果已保存到: arrears_result.json")
            
        except Exception as e:
            print(f"❌ 发生错误: {e}")
            await page.screenshot(path="error_screenshot.png", full_page=True)
            print("📸 错误截图: error_screenshot.png")
            
        finally:
            # 关闭浏览器
            await browser.close()
            print("🏁 浏览器已关闭")

if __name__ == "__main__":
    asyncio.run(main())