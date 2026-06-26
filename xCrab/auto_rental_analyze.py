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
            page.evaluate('''
                () => {
                    const inputs = document.querySelectorAll('input');
                    for (let inp of inputs) {
                        if (inp.type === 'text' || inp.type === 'tel') inp.value = 'YOUR_PHONE';
                        if (inp.type === 'password') inp.value = 'YOUR_PASSWORD';
                    }
                }
            ''')
            time.sleep(0.5)
            page.evaluate('() => { const cb = document.querySelector("input[type=\"checkbox\"]"); if (cb && !cb.checked) cb.click(); }')
            time.sleep(0.5)
            page.locator('button.login-button').click()
            time.sleep(8)
            
            # 导航到房源页面
            print("2. 导航到房源页面...")
            page.goto("https://gez.dongguanbank.cn/landlord/#/house/index", timeout=60000)
            time.sleep(5)
            
            # 点击已出租 tab
            print("3. 点击已出租...")
            page.evaluate('''
                () => {
                    const tabs = document.querySelectorAll('.el-tabs__item');
                    for (let tab of tabs) {
                        if (tab.textContent.includes('已出租')) { tab.click(); return; }
                    }
                }
            ''')
            time.sleep(3)
            page.screenshot(path="rented_list.png")
            
            # 找到303房并点击 - 分析DOM结构
            print("4. 分析并点击303房...")
            
            # 使用JS分析页面结构，找到303房的位置
            page.evaluate('''
                () => {
                    // 找到所有包含"303"的房间元素
                    const allElements = document.querySelectorAll('*');
                    const results = [];
                    for (let el of allElements) {
                        // 检查元素的直接文本内容
                        if (el.childNodes.length === 1 && el.textContent.trim() === '303') {
                            results.push({
                                tag: el.tagName,
                                class: el.className,
                                id: el.id,
                                text: el.textContent,
                                parent: el.parentElement?.className,
                                grandparent: el.parentElement?.parentElement?.className
                            });
                        }
                    }
                    console.log(JSON.stringify(results));
                }
            ''')
            
            # 监听控制台输出
            def handle_console(msg):
                if msg.text and msg.text.startswith('['):
                    print("   找到的元素:", msg.text)
            
            page.on('console', handle_console)
            
            # 另一种方法：直接找到房间列表区域
            page.evaluate('''
                () => {
                    // 找房间卡片
                    const cards = document.querySelectorAll('.room-card, [class*="room-item"], [class*="house-item"]');
                    console.log("房间卡片数:", cards.length);
                    
                    // 尝试找到303房的父元素并点击
                    const all = document.querySelectorAll('*');
                    for (let el of all) {
                        if (el.textContent.trim() === '303') {
                            console.log("找到303:", el.tagName, el.className);
                            // 找到父容器
                            let parent = el.parentElement;
                            for (let i = 0; i < 5 && parent; i++) {
                                console.log("  父级[" + i + "]:", parent.tagName, parent.className);
                                parent = parent.parentElement;
                            }
                            break;
                        }
                    }
                }
            ''')
            time.sleep(1)
            
            # 直接点击303 - 使用坐标点击
            print("5. 使用坐标点击303房...")
            
            # 先找到303的位置
            page.evaluate('''
                () => {
                    const all = document.querySelectorAll('*');
                    for (let el of all) {
                        if (el.childNodes.length === 1 && el.textContent.trim() === '303') {
                            const rect = el.getBoundingClientRect();
                            console.log(JSON.stringify({
                                x: rect.x + rect.width/2,
                                y: rect.y + rect.height/2,
                                width: rect.width,
                                height: rect.height
                            }));
                            return;
                        }
                    }
                }
            ''')
            time.sleep(1)
            
            # 使用鼠标点击
            page.mouse.click(300, 400)
            time.sleep(2)
            page.screenshot(path="after_mouse_click.png")
            
            # 检查是否弹出了对话框
            print("6. 检查对话框状态...")
            try:
                # 查找可能弹出的任何对话框或面板
                visible_elements = page.locator('[class*="dialog"]:visible, [class*="modal"]:visible').all()
                print(f"   找到 {len(visible_elements)} 个可见对话框元素")
                
                for elem in visible_elements:
                    try:
                        txt = elem.inner_text()
                        print(f"   对话框内容: {txt[:300]}")
                    except:
                        pass
            except Exception as e:
                print(f"   检查对话框异常: {e}")
            
            # 尝试点击"租约详情"
            print("7. 尝试点击租约详情...")
            try:
                page.locator('button:has-text("租约详情")').click(timeout=3000)
                print("   点击成功")
            except Exception as e:
                print(f"   点击失败: {e}")
                # 尝试JS方式
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
            page.screenshot(path="lease_detail_result.png")
            
            # 8. 提取信息
            print("8. 提取最终信息...")
            final_text = page.locator('body').inner_text()
            print("页面内容:")
            print(final_text[:8000])
            
            with open('final_result.txt', 'w', encoding='utf-8') as f:
                f.write(final_text)
            
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
