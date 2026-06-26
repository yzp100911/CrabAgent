from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
import time

def run():
    with sync_playwright() as p:
        # 使用系统Chrome浏览器，无头模式
        browser = p.chromium.launch(
            headless=True,
            executable_path='/usr/bin/google-chrome',
            args=[
                '--disable-dev-shm-usage',
                '--no-sandbox'
            ]
        )
        
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080}
        )
        page = context.new_page()
        
        try:
            # 1. 打开网站
            print("1. 正在打开网站...")
            page.goto("https://gez.dongguanbank.cn/landlord/#/house/index", timeout=60000)
            page.wait_for_load_state("networkidle", timeout=60000)
            time.sleep(3)
            page.screenshot(path="step1_homepage.png")
            
            # 2. 检查是否有"同意并授权"弹窗
            print("2. 检查授权弹窗...")
            try:
                agree_button = page.get_by_text("同意并授权", exact=False)
                if agree_button.is_visible(timeout=5000):
                    agree_button.click()
                    print("   已点击同意并授权")
                    time.sleep(2)
                    page.screenshot(path="step2_after_agree.png")
            except PlaywrightTimeoutError:
                print("   没有授权弹窗")
            
            # 3. 填写登录信息
            print("3. 填写登录信息...")
            try:
                phone_input = page.get_by_placeholder("请输入手机号")
                if phone_input.is_visible():
                    phone_input.fill("YOUR_PHONE")
                    print("   手机号已填写")
            except:
                print("   尝试备用方式填写手机号")
                page.fill('input', "YOUR_PHONE")
            
            time.sleep(0.5)
            
            # 填写密码
            try:
                password_input = page.get_by_placeholder("请输入密码")
                if password_input.is_visible():
                    password_input.fill("YOUR_PASSWORD")
                    print("   密码已填写")
            except:
                print("   尝试备用方式填写密码")
                # 尝试所有input字段
                inputs = page.locator('input')
                count = inputs.count()
                print(f"   找到 {count} 个input字段")
                for i in range(count):
                    try:
                        input_elem = inputs.nth(i)
                        input_type = input_elem.get_attribute('type')
                        placeholder = input_elem.get_attribute('placeholder')
                        print(f"   input[{i}]: type={input_type}, placeholder={placeholder}")
                    except:
                        pass
            
            time.sleep(0.5)
            page.screenshot(path="step3_before_login.png")
            
            # 4. 勾选用户协议
            print("4. 勾选用户协议...")
            try:
                checkbox = page.get_by_text("登录即代表同意莞e租", exact=False)
                if checkbox.is_visible():
                    checkbox.click()
                    print("   协议已勾选")
            except:
                print("   未找到协议复选框")
            
            time.sleep(0.5)
            
            # 5. 点击登录按钮
            print("5. 点击登录按钮...")
            try:
                login_button = page.get_by_role("button", name="登录")
                if login_button.is_visible():
                    login_button.click()
                    print("   登录按钮已点击")
            except:
                try:
                    buttons = page.locator("button")
                    for i in range(buttons.count()):
                        btn = buttons.nth(i)
                        text = btn.inner_text()
                        if "登录" in text:
                            btn.click()
                            print(f"   点击了按钮: {text}")
                            break
                except:
                    print("   登录按钮点击失败")
            
            # 等待登录完成
            print("6. 等待登录完成...")
            time.sleep(5)
            page.screenshot(path="step6_after_login.png")
            
            # 6. 点击左侧的"房源"
            print("7. 点击左侧的房源...")
            try:
                house_menu = page.get_bytext("房源", exact=False)
                house_menu.click()
                print("   已点击房源")
            except:
                print("   点击房源失败")
            
            time.sleep(2)
            page.screenshot(path="step7_after_house.png")
            
            # 7. 点击"已出租"
            print("8. 点击已出租...")
            try:
                rented_tab = page.get_bytext("已出租", exact=False)
                rented_tab.click()
                print("   已点击已出租")
            except:
                print("   点击已出租失败")
            
            time.sleep(2)
            page.screenshot(path="step8_rented_list.png")
            
            # 8. 找到并点击303房
            print("9. 查找并点击303房...")
            try:
                room_303 = page.get_bytext("303房", exact=False)
                room_303.click()
                print("   已点击303房")
            except:
                print("   点击303房失败")
            
            time.sleep(2)
            page.screenshot(path="step9_room_detail.png")
            
            # 9. 在弹出的窗口点击"租约详情"
            print("10. 点击租约详情...")
            try:
                lease_detail = page.get_bytext("租约详情", exact=False)
                lease_detail.click()
                print("   已点击租约详情")
            except:
                print("   点击租约详情失败")
            
            time.sleep(2)
            page.screenshot(path="step10_lease_detail.png")
            
            # 10. 获取页面内容
            print("11. 提取租约信息...")
            page.screenshot(path="lease_detail.png", fullPage=True)
            
            # 获取所有文本内容
            content = page.content()
            with open('page_content.html', 'w', encoding='utf-8') as f:
                f.write(content)
            
            # 尝试提取关键信息
            print("\n=== 页面文本内容 ===")
            text_content = page.inner_text('body')
            print(text_content[:5000])
            
            print("\n文件已保存:")
            print("- lease_detail.png (截图)")
            print("- page_content.html (HTML)")
            
        except Exception as e:
            print(f"发生错误: {e}")
            import traceback
            traceback.print_exc()
            page.screenshot(path="error.png")
        finally:
            context.close()
            browser.close()

if __name__ == "__main__":
    run()
