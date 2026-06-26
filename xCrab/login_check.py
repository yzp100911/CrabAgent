from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False, args=['--start-maximized'])
    context = browser.new_context(viewport={'width': 1920, 'height': 1080})
    page = context.new_page()
    
    # 打开登录页面
    page.goto("https://gez.dongguanbank.cn/landlord/#/house/index")
    page.wait_for_timeout(3000)
    
    # 检查是否需要登录
    page.screenshot(path="before_login.png")
    print("已截图登录前页面")
    
    # 尝试查找登录表单
    try:
        # 查找用户名输入框
        page.fill('input[type="text"]', 'YOUR_USERNAME', timeout=5000)
        page.fill('input[type="password"]', 'YOUR_PASSWORD')
        page.click('button[type="submit"]')
        page.wait_for_timeout(3000)
        page.screenshot(path="after_login.png")
        print("登录后截图完成")
    except Exception as e:
        print(f"登录表单未找到或已登录: {e}")
    
    browser.close()
