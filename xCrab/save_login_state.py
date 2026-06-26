from playwright.sync_api import sync_playwright
import time
import json

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
            # 1. 登录流程
            print("1. 登录...")
            page.goto("https://gez.dongguanbank.cn/landlord/#/house/index", timeout=60000)
            page.wait_for_load_state("networkidle", timeout=60000)
            time.sleep(3)
            
            # 同意授权
            try:
                page.get_by_text("同意并授权", exact=False).click()
                time.sleep(2)
            except:
                pass
            
            # 填写登录信息
            page.evaluate("""
                () => {
                    const inputs = document.querySelectorAll('input');
                    for (let inp of inputs) {
                        if (inp.type === 'text' || inp.type === 'tel') inp.value = 'YOUR_PHONE';
                        if (inp.type === 'password') inp.value = 'YOUR_PASSWORD';
                    }
                }
            """)
            time.sleep(0.5)
            
            # 勾选协议
            page.evaluate("""
                () => {
                    const cb = document.querySelector('input[type="checkbox"]');
                    if (cb && !cb.checked) cb.click();
                }
            """)
            time.sleep(0.5)
            page.locator('button.login-button').click()
            time.sleep(8)
            
            print(f"   登录后URL: {page.url}")
            
            # 保存登录状态
            print("   保存登录状态...")
            storage = context.storage_state()
            with open('storage_state.json', 'w') as f:
                json.dump(storage, f)
            print("   已保存到 storage_state.json")
            
            # 保持在这个页面，不要导航走
            time.sleep(2)
            
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