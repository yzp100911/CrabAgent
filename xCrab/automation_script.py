from playwright.sync_api import Playwright, sync_playwright
import time
import json

def run():
    with sync_playwright() as p:
        # 启动Chrome浏览器（无头模式）
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()
        
        results = []
        
        try:
            # 1. 打开网站
            print("正在打开网站...")
            page.goto("https://gez.dongguanbank.cn/landlord/#/house/index")
            page.wait_for_load_state("networkidle")
            time.sleep(2)
            
            # 2. 登录
            print("正在登录...")
            # 尝试多种可能的选择器
            selectors = [
                'input[placeholder*="账号"]',
                'input[placeholder*="手机号"]',
                'input[type="text"]',
                'input[name*="user"]',
                '.el-input__inner'
            ]
            
            for sel in selectors:
                try:
                    page.fill(sel, 'YOUR_USERNAME')
                    print(f"使用选择器 {sel} 输入账号成功")
                    break
                except:
                    continue
            
            time.sleep(0.5)
            
            # 输入密码
            password_selectors = [
                'input[placeholder*="密码"]',
                'input[type="password"]',
                'input[name*="pwd"]',
                'input[name*="password"]'
            ]
            
            for sel in password_selectors:
                try:
                    page.fill(sel, 'YOUR_PASSWORD')
                    print(f"使用选择器 {sel} 输入密码成功")
                    break
                except:
                    continue
            
            time.sleep(0.5)
            
            # 点击登录按钮
            button_selectors = [
                'button[type="submit"]',
                'button:has-text("登录")',
                '.el-button--primary',
                'button:has-text("登 录")'
            ]
            
            for sel in button_selectors:
                try:
                    page.click(sel)
                    print(f"使用选择器 {sel} 点击登录成功")
                    break
                except:
                    continue
            
            time.sleep(3)
            page.screenshot(path="after_login.png")
            print("登录后截图已保存")
            
            # 3. 点击左侧"房源"菜单
            print("正在点击房源菜单...")
            menu_selectors = [
                'text=房源',
                '.el-menu-item:has-text("房源")',
                '[class*="menu"] >> text=房源',
                'li:has-text("房源")'
            ]
            
            for sel in menu_selectors:
                try:
                    page.click(sel)
                    print(f"使用选择器 {sel} 点击房源成功")
                    break
                except:
                    continue
            
            time.sleep(3)
            page.screenshot(path="houses.png", full_page=True)
            print("房源页面截图已保存")
            
            # 4. 提取数据
            print("\n正在提取房源数据...")
            
            # 获取页面内容
            content = page.content()
            
            # 尝试查找表格数据
            try:
                # 使用JavaScript提取表格数据
                table_data = page.evaluate('''
                    () => {
                        const data = [];
                        // 尝试查找el-table
                        const tables = document.querySelectorAll('.el-table__body tr');
                        tables.forEach(row => {
                            const cells = row.querySelectorAll('td');
                            const rowData = [];
                            cells.forEach(cell => {
                                rowData.push(cell.innerText.trim());
                            });
                            if (rowData.length > 0) {
                                data.push(rowData);
                            }
                        });
                        return data;
                    }
                ''')
                if table_data:
                    print(f"找到 {len(table_data)} 行数据")
                    for row in table_data[:20]:  # 只打印前20行
                        print(row)
            except Exception as e:
                print(f"表格提取失败: {e}")
            
            # 查找即将到期
            try:
                expiring = page.evaluate('''
                    () => {
                        // 查找所有包含"到期"关键词的行
                        const rows = document.querySelectorAll('tr, .el-table__row, [class*="row"]');
                        const results = [];
                        rows.forEach(row => {
                            const text = row.innerText;
                            if (text.includes('到期') || text.includes('即将到期')) {
                                results.push(text);
                            }
                        });
                        return results;
                    }
                ''')
                if expiring:
                    print(f"\n即将到期的房源:")
                    for item in expiring:
                        print(item)
            except Exception as e:
                print(f"查找失败: {e}")
                
        except Exception as e:
            print(f"发生错误: {e}")
            import traceback
            traceback.print_exc()
            page.screenshot(path="error.png")
        finally:
            browser.close()
            print("\n浏览器已关闭")

if __name__ == "__main__":
    run()
