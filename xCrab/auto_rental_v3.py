from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            executable_path='/usr/bin/google-chrome',
            args=['--disable-dev-shm-usage', '--no-sandbox']
        )
        
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()
        
        try:
            # 1. 打开网站
            print("1. 打开网站...")
            page.goto("https://gez.dongguanbank.cn/landlord/#/house/index", timeout=60000)
            page.wait_for_load_state("networkidle", timeout=60000)
            time.sleep(3)
            
            # 2. 同意授权弹窗
            print("2. 检查授权弹窗...")
            try:
                agree = page.get_by_text("同意并授权", exact=False)
                if agree.is_visible(timeout=3000):
                    agree.click()
                    print("   已同意")
                    time.sleep(2)
            except:
                print("   无弹窗")
            
            # 3. 填写登录信息
            print("3. 填写登录信息...")
            # 手机号
            try:
                page.get_by_placeholder("请输入手机号").fill("YOUR_PHONE")
                print("   手机号OK")
            except:
                page.locator('input[type="tel"], input[placeholder*="手机"]').first.fill("YOUR_PHONE")
                print("   手机号OK(备用)")

            # 密码
            try:
                page.get_by_placeholder("请输入密码").fill("YOUR_PASSWORD")
                print("   密码OK")
            except:
                page.locator('input[type="password"]').first.fill("YOUR_PASSWORD")
                print("   密码OK(备用)")
            
            time.sleep(0.5)
            
            # 4. 勾选协议
            print("4. 勾选协议...")
            try:
                page.get_by_text("登录即代表同意").click()
                print("   协议OK")
            except:
                page.locator('input[type="checkbox"]').check()
                print("   协议OK(备用)")
            
            time.sleep(0.5)
            
            # 5. 点击登录
            print("5. 点击登录...")
            page.get_by_role("button", name="登录").click()
            print("   登录中...")
            
            time.sleep(5)
            page.screenshot(path="after_login.png")
            
            # 获取登录后页面快照
            print("\n登录后页面结构:")
            try:
                snapshot = page.locator('body').inner_text()
                print(snapshot[:3000])
            except:
                pass
            
            # 6. 点击左侧菜单 - 尝试多种方式
            print("\n6. 点击房源菜单...")
            # 获取所有可点击文本
            all_text = page.locator('*').all_inner_texts()
            print(f"页面元素数量: {len(all_text)}")
            
            # 打印包含"房源"字的元素
            for i, text in enumerate(all_text):
                if text.strip() and "房源" in text.strip():
                    print(f"  找到[房源]: {text.strip()[:50]}")
            
            # 尝试点击
            selectors_to_try = [
                page.get_by_text("房源"),
                page.locator('text=房源'),
                page.locator('[class*="menu"] text=房源'),
                page.locator('div:has-text("房源")').first,
            ]
            
            for selector in selectors_to_try:
                try:
                    if selector.is_visible(timeout=2000):
                        selector.click()
                        print(f"   点击成功!")
                        break
                except:
                    continue
            else:
                print("   所有方式都失败，尝试截图分析")
                page.screenshot(path="debug_menu.png")
            
            time.sleep(2)
            page.screenshot(path="after_house_click.png")
            
            # 7. 点击"已出租"
            print("7. 点击已出租...")
            for selector in [page.get_by_text("已出租"), page.locator('text=已出租')]:
                try:
                    if selector.is_visible(timeout=2000):
                        selector.click()
                        print("   已出租点击成功!")
                        break
                except:
                    continue
            else:
                print("   点击已出租失败")
            
            time.sleep(2)
            page.screenshot(path="rented_tab.png")
            
            # 8. 点击303房
            print("8. 点击303房...")
            for selector in [page.get_by_text("303房"), page.locator('text=303房')]:
                try:
                    if selector.is_visible(timeout=2000):
                        selector.click()
                        print("   303房点击成功!")
                        break
                except:
                    continue
            else:
                print("   点击303房失败")
            
            time.sleep(2)
            page.screenshot(path="room_303.png")
            
            # 9. 点击租约详情
            print("9. 点击租约详情...")
            for selector in [page.get_by_text("租约详情"), page.locator('text=租约详情')]:
                try:
                    if selector.is_visible(timeout=2000):
                        selector.click()
                        print("   租约详情点击成功!")
                        break
                except:
                    continue
            else:
                print("   点击租约详情失败")
            
            time.sleep(2)
            page.screenshot(path="lease_detail_final.png")
            
            # 10. 提取信息
            print("\n10. 最终页面内容:")
            try:
                final_text = page.locator('body').inner_text()
                print(final_text[:5000])
                
                with open('final_page.txt', 'w', encoding='utf-8') as f:
                    f.write(final_text)
            except:
                pass
            
            page.screenshot(path="lease_detail.png")
            print("\n完成!")
            
        except Exception as e:
            print(f"错误: {e}")
            import traceback
            traceback.print_exc()
            page.screenshot(path="error.png")
        finally:
            context.close()
            browser.close()

if __name__ == "__main__":
    run()
