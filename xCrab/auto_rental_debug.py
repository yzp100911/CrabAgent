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
            page.screenshot(path="login_page.png")
            print(f"   当前URL: {page.url}")
            
            # 2. 同意授权弹窗
            print("2. 检查授权弹窗...")
            try:
                agree = page.get_by_text("同意并授权", exact=False)
                if agree.is_visible(timeout=3000):
                    agree.click()
                    print("   已同意")
                    time.sleep(2)
                    page.screenshot(path="after_agree.png")
            except:
                print("   无弹窗")
            
            # 3. 填写登录信息
            print("3. 填写登录信息...")
            
            # 直接获取所有input
            all_inputs = page.locator('input').all()
            print(f"   找到 {len(all_inputs)} 个input")
            
            for idx, inp in enumerate(all_inputs):
                try:
                    pldr = inp.get_attribute('placeholder') or ''
                    inp_type = inp.get_attribute('type') or ''
                    print(f"   [{idx}] placeholder='{pldr}', type='{inp_type}'")
                except:
                    print(f"   [{idx}] 无法获取属性")
            
            # 使用JS直接设置值（绕过placeholder匹配问题）
            print("   使用JS方式填写...")
            page.evaluate('''
                () => {
                    const inputs = document.querySelectorAll('input');
                    for (let inp of inputs) {
                        if (inp.type === 'tel' || inp.placeholder?.includes('手机')) {
                            inp.value = 'YOUR_PHONE';
                            inp.dispatchEvent(new Event('input', { bubbles: true }));
                            inp.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                        if (inp.type === 'password' || inp.placeholder?.includes('密码')) {
                            inp.value = 'YOUR_PASSWORD';
                            inp.dispatchEvent(new Event('input', { bubbles: true }));
                            inp.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                }
            ''')
            time.sleep(1)
            page.screenshot(path="filled.png")
            
            # 4. 勾选协议
            print("4. 勾选协议...")
            page.evaluate('''
                () => {
                    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
                    for (let cb of checkboxes) {
                        if (!cb.checked) {
                            cb.click();
                            cb.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                }
            ''')
            time.sleep(0.5)
            
            # 5. 点击登录 - 找按钮
            print("5. 点击登录...")
            buttons = page.locator('button').all()
            print(f"   找到 {len(buttons)} 个button")
            for idx, btn in enumerate(buttons):
                try:
                    txt = btn.inner_text()
                    cls = btn.get_attribute('class') or ''
                    print(f"   [{idx}] text='{txt.strip()}', class='{cls}'")
                except:
                    print(f"   [{idx}] 无法获取")
            
            # 点击primary类型的按钮
            page.evaluate('''
                () => {
                    const buttons = document.querySelectorAll('button');
                    for (let btn of buttons) {
                        if (btn.textContent.trim().includes('登录') && btn.className.includes('primary')) {
                            btn.click();
                            return;
                        }
                    }
                    // 备选：点击最后一个可见的登录按钮
                    for (let btn of buttons) {
                        if (btn.textContent.trim() === '登录') {
                            btn.click();
                            return;
                        }
                    }
                }
            ''')
            
            print("   等待登录完成...")
            time.sleep(8)
            page.screenshot(path="after_login.png")
            
            # 检查是否还在登录页
            url = page.url
            print(f"   当前URL: {url}")
            
            body = page.locator('body').inner_text()
            if "登录" in body[:200] and "密码" in body[:200]:
                print("   警告：可能仍在登录页")
                # 再次尝试
                page.locator('button:has-text("登录")').first.click()
                time.sleep(5)
                page.screenshot(path="after_login_retry.png")
            else:
                print("   登录似乎成功")
            
            # 6-9 后续步骤
            print("\n6-9 执行后续点击...")
            page.screenshot(path="main_page.png")
            
            # 获取页面所有文本
            page_text = page.locator('body').inner_text()
            print("页面内容片段:")
            print(page_text[:2000])
            
            # 继续点击操作...
            # ... (简化版后续代码)
            
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
