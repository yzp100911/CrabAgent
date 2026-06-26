from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
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
            page.screenshot(path="step1.png")
            
            # 2. 同意授权弹窗
            print("2. 检查授权弹窗...")
            try:
                agree = page.get_by_text("同意并授权", exact=False)
                if agree.is_visible(timeout=3000):
                    agree.click()
                    print("   已同意")
                    time.sleep(2)
            except:
                print("   无弹窗")
            page.screenshot(path="step2_after_agree.png")
            
            # 3. 填写登录信息 - 详细调试
            print("3. 填写登录信息...")
            
            # 找到所有输入框
            inputs = page.locator('input').all()
            print(f"   找到 {len(inputs)} 个input元素")
            
            for i, inp in enumerate(inputs):
                try:
                    inp_type = inp.get_attribute('type')
                    inp_placeholder = inp.get_attribute('placeholder')
                    inp_name = inp.get_attribute('name')
                    print(f"   input[{i}]: type={inp_type}, placeholder={inp_placeholder}, name={inp_name}")
                except:
                    print(f"   input[{i}]: 无法获取属性")
            
            # 使用正确的方式填写
            try:
                # 尝试查找手机号输入框
                phone_selector = page.locator('input[placeholder*="手机"], input[type="tel"]').first
                phone_selector.fill("YOUR_PHONE")
                print("   手机号已填写 (方式1)")
            except Exception as e1:
                print(f"   方式1失败: {e1}")
                try:
                    # 方式2：按顺序填前两个input
                    page.locator('input').nth(0).fill("YOUR_PHONE")
                    print("   手机号已填写 (方式2)")
                except Exception as e2:
                    print(f"   方式2失败: {e2}")
            
            time.sleep(0.5)
            
            # 填写密码
            try:
                password_selector = page.locator('input[placeholder*="密码"], input[type="password"]').first
                password_selector.fill("YOUR_PASSWORD")
                print("   密码已填写 (方式1)")
            except Exception as e1:
                print(f"   方式1失败: {e1}")
                try:
                    page.locator('input').nth(1).fill("YOUR_PASSWORD")
                    print("   密码已填写 (方式2)")
                except Exception as e2:
                    print(f"   方式2失败: {e2}")
            
            page.screenshot(path="step3_filled.png")
            time.sleep(0.5)
            
            # 4. 勾选协议
            print("4. 勾选协议...")
            try:
                page.locator('input[type="checkbox"]').check()
                print("   协议已勾选")
            except Exception as e:
                print(f"   勾选失败: {e}")
            
            time.sleep(0.5)
            
            # 5. 点击登录
            print("5. 点击登录...")
            try:
                login_btn = page.get_by_role("button", name="登录")
                login_btn.click()
                print("   登录按钮已点击")
            except Exception as e:
                print(f"   按钮点击失败: {e}")
                try:
                    page.locator('button:has-text("登录")').click()
                    print("   登录按钮已点击(备用)")
                except Exception as e2:
                    print(f"   备用按钮点击也失败: {e2}")
            
            print("   等待登录结果...")
            time.sleep(8)
            page.screenshot(path="step5_after_login.png")
            
            # 检查是否登录成功 - 看URL或页面内容
            current_url = page.url
            print(f"   当前URL: {current_url}")
            
            body_text = page.locator('body').inner_text()
            print(f"   页面内容前500字:\n{body_text[:500]}")
            
            # 如果还在登录页，尝试其他方式
            if "登录" in body_text and "密码" in body_text:
                print("\n   检测到仍在登录页，尝试更精确的输入方式...")
                
                # 重新获取输入框
                phone_inp = page.locator('input').first
                pass_inp = page.locator('input').nth(1)
                
                # 清空并重新填写
                phone_inp.clear()
                phone_inp.fill("YOUR_PHONE")
                pass_inp.clear()
                pass_inp.fill("YOUR_PASSWORD")
                
                time.sleep(0.5)
                
                # 再次勾选协议
                try:
                    page.locator('input[type="checkbox"]').check()
                except:
                    pass
                
                time.sleep(0.5)
                
                # 再次点击登录
                page.locator('button').last.click()
                print("   重新点击登录")
                
                time.sleep(8)
                page.screenshot(path="step5_retry_login.png")
                
                body_text = page.locator('body').inner_text()
                print(f"   重试后页面内容:\n{body_text[:500]}")
            
            # 继续执行后续步骤
            print("\n6. 点击房源菜单...")
            time.sleep(2)
            
            # 打印包含"房源"的元素
            all_elements = page.locator('*').all()
            for elem in all_elements:
                try:
                    text = elem.inner_text()
                    if text and "房源" in text.strip():
                        print(f"   找到: {text.strip()[:50]}")
                        # 尝试点击
                        try:
                            elem.click()
                            print("   点击成功!")
                            break
                        except:
                            pass
                except:
                    pass
            
            time.sleep(2)
            page.screenshot(path="step6.png")
            
            print("\n7. 点击已出租...")
            for elem in page.locator('*').all():
                try:
                    text = elem.inner_text()
                    if text and "已出租" in text.strip():
                        print(f"   找到: {text.strip()[:50]}")
                        try:
                            elem.click()
                            print("   点击成功!")
                            break
                        except:
                            pass
                except:
                    pass
            
            time.sleep(2)
            page.screenshot(path="step7.png")
            
            print("\n8. 点击303房...")
            for elem in page.locator('*').all():
                try:
                    text = elem.inner_text()
                    if text and "303" in text.strip():
                        print(f"   找到: {text.strip()[:50]}")
                        try:
                            elem.click()
                            print("   点击成功!")
                            break
                        except:
                            pass
                except:
                    pass
            
            time.sleep(2)
            page.screenshot(path="step8.png")
            
            print("\n9. 点击租约详情...")
            for elem in page.locator('*').all():
                try:
                    text = elem.inner_text()
                    if text and "租约详情" in text.strip():
                        print(f"   找到: {text.strip()[:50]}")
                        try:
                            elem.click()
                            print("   点击成功!")
                            break
                        except:
                            pass
                except:
                    pass
            
            time.sleep(2)
            page.screenshot(path="step9.png")
            
            # 10. 提取信息
            print("\n10. 最终页面:")
            final_text = page.locator('body').inner_text()
            print(final_text[:5000])
            
            with open('final_result.txt', 'w', encoding='utf-8') as f:
                f.write(final_text)
            
            page.screenshot(path="lease_detail.png")
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
