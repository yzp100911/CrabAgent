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
            page.screenshot(path="after_login.png")
            
            url = page.url
            print(f"   URL: {url}")
            
            # 6. 点击"房源"
            print("\n6. 点击房源...")
            time.sleep(2)
            
            # 查找左侧菜单
            menu_items = page.locator('.menu-item, .sidebar-item, [class*="menu"]').all()
            print(f"   找到 {len(menu_items)} 个菜单项")
            
            for item in menu_items:
                try:
                    txt = item.inner_text()
                    if '房源' in txt:
                        print(f"   点击: {txt.strip()}")
                        item.click()
                        break
                except:
                    pass
            
            time.sleep(2)
            page.screenshot(path="after_house_menu.png")
            
            # 7. 点击"已出租" tab
            print("7. 点击已出租...")
            tabs = page.locator('.tab-item, .el-tabs__item, [class*="tab"]').all()
            for tab in tabs:
                try:
                    txt = tab.inner_text()
                    if '已出租' in txt:
                        print(f"   点击: {txt.strip()}")
                        tab.click()
                        break
                except:
                    pass
            
            time.sleep(2)
            page.screenshot(path="rented_tab.png")
            
            # 8. 找303房并点击
            print("8. 找303房...")
            all_text = page.locator('body').inner_text()
            
            # 查找房间列表
            room_items = page.locator('[class*="room"], [class*="item"], .room-card').all()
            print(f"   找到 {len(room_items)} 个房间元素")
            
            for item in room_items:
                try:
                    txt = item.inner_text()
                    if '303' in txt:
                        print(f"   找到303: {txt.strip()[:80]}")
                        item.click()
                        break
                except:
                    pass
            
            time.sleep(2)
            page.screenshot(path="room_303.png")
            
            # 9. 点击租约详情
            print("9. 点击租约详情...")
            buttons = page.locator('button').all()
            for btn in buttons:
                try:
                    txt = btn.inner_text()
                    if '租约详情' in txt:
                        print(f"   点击: {txt.strip()}")
                        btn.click()
                        break
                except:
                    pass
            
            time.sleep(2)
            page.screenshot(path="lease_detail.png")
            
            # 10. 提取信息
            print("\n10. 租约详情内容:")
            detail_text = page.locator('body').inner_text()
            print(detail_text[:5000])
            
            # 保存结果
            with open('lease_info.txt', 'w', encoding='utf-8') as f:
                f.write(detail_text)
            
            # 尝试提取关键数据
            print("\n=== 尝试提取关键信息 ===")
            lines = detail_text.split('\n')
            for i, line in enumerate(lines):
                line = line.strip()
                if any(kw in line for kw in ['租金', '押金', '租期', '起止', '租客', '姓名']):
                    print(f"  {line}")
                    # 打印周围行
                    for j in range(max(0, i-1), min(len(lines), i+3)):
                        if lines[j].strip():
                            print(f"    上下文: {lines[j].strip()}")
            
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
