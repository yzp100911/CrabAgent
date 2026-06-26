from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1920, "height": 1080})
    page = context.new_page()
    
    print("1. 打开网站...")
    page.goto("https://gez.dongguanbank.cn/landlord/#/house/index")
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    
    print("2. 登录...")
    page.fill('input[placeholder*="账号"]', 'YOUR_USERNAME')
    time.sleep(0.3)
    page.fill('input[placeholder*="密码"]', 'YOUR_PASSWORD')
    time.sleep(0.3)
    page.click('button[type="submit"]')
    time.sleep(3)
    
    print("3. 点击房源菜单...")
    page.click('text=房源')
    time.sleep(2)
    
    # 保存登录状态
    context.storage_state(path="logged_in.json")
    print("登录状态已保存")
    
    # 获取页面内容
    print("\n页面HTML片段:")
    html = page.content()
    
    # 尝试提取关键数据
    print("\n提取数据...")
    
    # 使用JS提取表格数据
    data = page.evaluate('''
        () => {
            const result = {
                rows: [],
                hasExpiring: false,
                expiringRooms: []
            };
            
            // 查找表格行
            const tableRows = document.querySelectorAll('.el-table__body tr');
            tableRows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length > 0) {
                    const rowText = Array.from(cells).map(c => c.innerText.trim()).join(' | ');
                    result.rows.push(rowText);
                    
                    if (rowText.includes('到期')) {
                        result.hasExpiring = true;
                        result.expiringRooms.push(rowText);
                    }
                }
            });
            
            return result;
        }
    ''')
    
    print(f"找到 {len(data['rows'])} 行数据")
    
    if data['expiringRooms']:
        print(f"\n即将到期的房源 ({len(data['expiringRooms'])} 间):")
        for room in data['expiringRooms']:
            print(room)
    else:
        print("\n没有找到即将到期的房源，或者数据提取失败")
        print("前10行数据:")
        for row in data['rows'][:10]:
            print(row)
    
    page.screenshot(path="result.png", full_page=True)
    print("\n截图已保存为 result.png")
    
    browser.close()
