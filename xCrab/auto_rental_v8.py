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
            
            try:
                page.get_by_text("同意并授权", exact=False).click()
                time.sleep(2)
            except:
                pass
            
            page.locator('input[placeholder*="手机"]').fill("YOUR_PHONE")
            page.locator('input[placeholder*="密码"]').fill("YOUR_PASSWORD")
            time.sleep(0.5)
            
            page.evaluate("() => { const cb = document.querySelector('input[type=\"checkbox\"]'); if (cb) cb.click(); }")
            time.sleep(0.5)
            
            page.locator('button.login-button').click()
            time.sleep(10)
            
            # 2. 导航到房源页面
            print("2. 导航到房源页面...")
            page.goto("https://gez.dongguanbank.cn/landlord/#/house/index", timeout=60000)
            time.sleep(5)
            
            # 3. 点击已出租tab
            print("3. 点击已出租tab...")
            page.evaluate("""
                () => {
                    const tabs = document.querySelectorAll('.el-tabs__item');
                    for (let tab of tabs) {
                        if (tab.textContent.includes('已出租')) { tab.click(); return; }
                    }
                }
            """)
            time.sleep(3)
            page.screenshot(path="rented_tab.png")
            
            # 4. 点击303房
            print("4. 点击303房...")
            page.evaluate("""
                () => {
                    const all = document.querySelectorAll('*');
                    for (let el of all) {
                        if (el.textContent.trim() === '303') {
                            el.click();
                            return;
                        }
                    }
                }
            """)
            time.sleep(3)
            page.screenshot(path="after_303_click.png")
            
            # 5. 检查弹出的对话框
            print("5. 检查对话框...")
            dialog_html = page.evaluate("""
                () => {
                    const dialogs = document.querySelectorAll('.el-dialog');
                    for (let d of dialogs) {
                        if (getComputedStyle(d).display !== 'none') {
                            return {
                                title: d.querySelector('.el-dialog__title')?.textContent,
                                buttons: Array.from(d.querySelectorAll('button')).map(b => b.textContent.trim()),
                                content: d.innerHTML.substring(0, 1000)
                            };
                        }
                    }
                    return null;
                }
            """)
            print(f"   对话框信息: {json.dumps(dialog_html, ensure_ascii=False)}")
            
            # 6. 在对话框中查找并点击"查看详情"或"租约详情"
            print("6. 点击查看详情...")
            page.evaluate("""
                () => {
                    const dialogs = document.querySelectorAll('.el-dialog');
                    for (let d of dialogs) {
                        if (getComputedStyle(d).display !== 'none') {
                            const buttons = d.querySelectorAll('button');
                            for (let btn of buttons) {
                                if (btn.textContent.includes('详情') || btn.textContent.includes('查看')) {
                                    btn.click();
                                    return;
                                }
                            }
                        }
                    }
                }
            """)
            time.sleep(3)
            page.screenshot(path="after_detail_click.png")
            
            # 7. 再次检查对话框
            print("7. 检查详情对话框...")
            detail_html = page.evaluate("""
                () => {
                    const dialogs = document.querySelectorAll('.el-dialog');
                    let result = [];
                    for (let d of dialogs) {
                        if (getComputedStyle(d).display !== 'none') {
                            result.push({
                                title: d.querySelector('.el-dialog__title')?.textContent,
                                html: d.innerHTML.substring(0, 2000)
                            });
                        }
                    }
                    return JSON.stringify(result);
                }
            """)
            print(f"   详情对话框: {detail_html}")
            
            # 8. 获取最终页面的所有文本
            print("8. 提取最终信息...")
            final_text = page.locator('body').inner_text()
            
            # 查找租约相关信息
            lines = final_text.split('\n')
            print("\n=== 租约相关信息 ===")
            keywords = ['租金', '押金', '租期', '租客', '姓名', '起', '止', '月', '元']
            for line in lines:
                line = line.strip()
                if line and any(kw in line for kw in keywords):
                    print(f"  {line}")
            
            with open('lease_detail_info.txt', 'w', encoding='utf-8') as f:
                f.write(final_text)
            
            page.screenshot(path="final_result.png")
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