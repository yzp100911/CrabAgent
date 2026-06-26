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
            page.screenshot(path="step1.png")
            
            # 5. 关闭"操作提醒"对话框
            print("5. 关闭操作提醒对话框...")
            page.evaluate("""
                () => {
                    const dialogs = document.querySelectorAll('.el-dialog');
                    for (let d of dialogs) {
                        if (d.textContent.includes('操作提醒')) {
                            const closeBtn = d.querySelector('.el-dialog__headerbtn');
                            if (closeBtn) closeBtn.click();
                            return;
                        }
                    }
                }
            """)
            time.sleep(2)
            page.screenshot(path="step2_closed.png")
            
            # 6. 再次点击303房
            print("6. 再次点击303房...")
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
            page.screenshot(path="step3.png")
            
            # 7. 检查对话框并提取信息
            print("7. 检查对话框...")
            result = page.evaluate("""
                () => {
                    const dialogs = document.querySelectorAll('.el-dialog');
                    let results = [];
                    for (let d of dialogs) {
                        if (getComputedStyle(d).display !== 'none') {
                            results.push({
                                title: d.querySelector('.el-dialog__title')?.textContent || d.querySelector('.signTit')?.textContent,
                                fullText: d.innerText,
                                html: d.innerHTML.substring(0, 3000)
                            });
                        }
                    }
                    return JSON.stringify(results);
                }
            """)
            
            if result:
                data = json.loads(result)
                for i, dlg in enumerate(data):
                    print(f"\n对话框{i+1}: {dlg.get('title', '无标题')}")
                    print(f"内容: {dlg.get('fullText', '')[:1000]}")
            
            # 8. 尝试点击"租约详情"按钮
            print("\n8. 点击租约详情...")
            page.evaluate("""
                () => {
                    const buttons = document.querySelectorAll('button');
                    for (let btn of buttons) {
                        if (btn.textContent.includes('租约详情') || btn.textContent.includes('详情')) {
                            console.log('找到按钮:', btn.textContent);
                            btn.click();
                            return;
                        }
                    }
                }
            """)
            time.sleep(3)
            page.screenshot(path="step4_lease_detail.png")
            
            # 9. 再次检查对话框获取租约详情
            print("9. 提取租约详情...")
            final_result = page.evaluate("""
                () => {
                    const dialogs = document.querySelectorAll('.el-dialog');
                    let results = [];
                    for (let d of dialogs) {
                        if (getComputedStyle(d).display !== 'none') {
                            results.push({
                                title: d.querySelector('.el-dialog__title')?.textContent || d.querySelector('.signTit')?.textContent,
                                fullText: d.innerText
                            });
                        }
                    }
                    return JSON.stringify(results);
                }
            """)
            
            if final_result:
                print(f"最终对话框: {final_result}")
            
            # 10. 获取完整页面文本
            final_text = page.locator('body').inner_text()
            
            # 查找关键信息
            print("\n=== 页面中的关键信息 ===")
            lines = final_text.split('\n')
            keywords = ['租金', '押金', '租期', '租客', '姓名', '起', '止', '月', '元', '详情', '303']
            for line in lines:
                line = line.strip()
                if line and any(kw in line for kw in keywords):
                    print(f"  {line}")
            
            with open('final_result.txt', 'w', encoding='utf-8') as f:
                f.write(final_text)
            
            page.screenshot(path="final.png")
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