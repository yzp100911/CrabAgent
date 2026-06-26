from playwright.sync_api import sync_playwright
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
                page.get_by_text("同意并授权", exact=False).click()
                print("   已同意")
                time.sleep(2)
            except:
                print("   无弹窗")
            
            # 3. 填写登录信息
            print("3. 填写登录信息...")
            page.evaluate('''
                () => {
                    const inputs = document.querySelectorAll('input');
                    for (let inp of inputs) {
                        if (inp.type === 'text' || inp.type === 'tel') {
                            inp.value = 'YOUR_PHONE';
                            inp.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                        if (inp.type === 'password') {
                            inp.value = 'YOUR_PASSWORD';
                            inp.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                }
            ''')
            time.sleep(1)
            
            # 4. 勾选协议
            print("4. 勾选协议...")
            page.evaluate('''
                () => {
                    const cb = document.querySelector('input[type="checkbox"]');
                    if (cb && !cb.checked) cb.click();
                }
            ''')
            time.sleep(0.5)
            
            # 5. 点击登录
            print("5. 点击登录...")
            page.locator('button.login-button').click()
            time.sleep(8)
            
            # 6. 直接导航到房源页面
            print("6. 导航到房源页面...")
            page.goto("https://gez.dongguanbank.cn/landlord/#/house/index", timeout=60000)
            time.sleep(5)
            
            # 7. 点击"已出租" tab - 可能已经是默认选中的
            print("7. 点击已出租tab...")
            page.evaluate('''
                () => {
                    const tabs = document.querySelectorAll('.el-tabs__item');
                    for (let tab of tabs) {
                        if (tab.textContent.includes('已出租')) {
                            tab.click();
                            return;
                        }
                    }
                }
            ''')
            time.sleep(2)
            
            # 8. 找303房 - 直接用Playwright API点击
            print("8. 找303房并点击...")
            
            # 打印包含303的元素信息
            elements = page.locator('text=303房').all()
            print(f"   找到 {len(elements)} 个包含'303房'的元素")
            
            for i, elem in enumerate(elements):
                try:
                    bbox = elem.bounding_box()
                    print(f"   [{i}] bounding_box: {bbox}")
                    txt = elem.inner_text()
                    print(f"   [{i}] text: {txt}")
                except Exception as e:
                    print(f"   [{i}] error: {e}")
            
            # 点击第一个303房元素
            if elements:
                elements[0].click()
                print("   已点击303房")
            else:
                print("   未找到303房，尝试备用方式...")
                # 直接点击文本"303房"
                page.locator('text="303房"').click()
            
            time.sleep(3)
            page.screenshot(path="after_303_click.png")
            
            # 检查是否弹出了对话框
            print("9. 检查对话框...")
            dialog = page.locator('.el-dialog__body, [class*="dialog__body"]').first
            try:
                if dialog.is_visible():
                    dialog_text = dialog.inner_text()
                    print(f"   对话框内容: {dialog_text[:500]}")
            except:
                pass
            
            # 10. 点击租约详情
            print("10. 点击租约详情...")
            lease_btn = page.locator('button:has-text("租约详情")').first
            try:
                if lease_btn.is_visible():
                    lease_btn.click()
                    print("   已点击租约详情")
            except:
                print("   尝试JS方式...")
                page.evaluate('''
                    () => {
                        const buttons = document.querySelectorAll('button');
                        for (let btn of buttons) {
                            if (btn.textContent.includes('租约详情')) {
                                btn.click();
                                return;
                            }
                        }
                    }
                ''')
            
            time.sleep(3)
            page.screenshot(path="lease_detail_final.png")
            
            # 11. 提取信息
            print("\n11. 提取租约详情...")
            final_text = page.locator('body').inner_text()
            print("最终页面内容:")
            print(final_text[:10000])
            
            with open('lease_detail_result.txt', 'w', encoding='utf-8') as f:
                f.write(final_text)
            
            # 解析关键信息
            lines = final_text.split('\n')
            print("\n=== 关键信息 ===")
            keywords = ['租金', '押金', '租期', '租客', '起', '止', '姓名']
            for i, line in enumerate(lines):
                for kw in keywords:
                    if kw in line:
                        print(f"  {line.strip()}")
                        break
            
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
