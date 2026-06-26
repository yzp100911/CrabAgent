"""
SenseNova API 测试脚本 v2
修复: reasoning 字段、内容提取、流式解析
"""
import os
import sys
import json
import base64
from openai import OpenAI

API_KEY = os.getenv("SENSENOVA_API_KEY", "sk-J3aaNZBvFSvpHJhmiASXCrkx1abynDhA")
BASE_URL = "https://token.sensenova.cn/v1"
DEFAULT_MODEL = "sensenova-6.7-flash-lite"


def init_client() -> OpenAI:
    return OpenAI(api_key=API_KEY, base_url=BASE_URL)


def extract_content(msg):
    """从 message 中提取内容，兼容 reasoning 字段"""
    # 有些模型把思考内容放在 reasoning 字段，content 才是真正回复
    content = msg.content or ""
    if not content and hasattr(msg, "reasoning") and msg.reasoning:
        # 如果 content 为空但有 reasoning，取 reasoning
        content = msg.reasoning
    return content


def test_text_chat():
    """测试 1: 纯文本对话"""
    print("=" * 60)
    print("🧪 测试 1: 纯文本对话")
    print("=" * 60)
    client = init_client()
    try:
        response = client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[
                {"role": "system", "content": "你是一个简洁有用的助手。回答控制在30字以内。"},
                {"role": "user", "content": "请用一句话介绍商汤科技。"},
            ],
            stream=False,
            temperature=0.6,
            max_tokens=200,
        )
        msg = response.choices[0].message
        content = extract_content(msg)
        print(f"✅ 模型: {response.model}")
        print(f"✅ 响应: {content}")
        if hasattr(msg, "reasoning") and msg.reasoning:
            print(f"💭 思考过程: {msg.reasoning[:100]}...")
        print(f"📊 Token: {response.usage.total_tokens} (in:{response.usage.prompt_tokens} out:{response.usage.completion_tokens})")
        return True
    except Exception as e:
        print(f"❌ 错误: {e}")
        return False


def test_stream_chat():
    """测试 2: 流式对话"""
    print("\n" + "=" * 60)
    print("🧪 测试 2: 流式对话 (SSE)")
    print("=" * 60)
    client = init_client()
    try:
        stream = client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[
                {"role": "system", "content": "你是一个简洁的助手。回答控制在30字以内。"},
                {"role": "user", "content": "一句话介绍北京。"},
            ],
            stream=True,
            temperature=0.6,
            max_tokens=200,
        )
        print("✅ 流式响应: ", end="", flush=True)
        full_content = ""
        chunk_count = 0
        for chunk in stream:
            if chunk.choices and len(chunk.choices) > 0:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    content = delta.content
                    full_content += content
                    print(content, end="", flush=True)
                    chunk_count += 1
        print(f"\n📝 共 {chunk_count} 个chunk, {len(full_content)} 字符")
        return True
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        return False


def test_deepseek():
    """测试 3: DeepSeek 模型思考模式"""
    print("\n" + "=" * 60)
    print("🧪 测试 3: DeepSeek V4 Flash - 思考模式")
    print("=" * 60)
    client = init_client()
    try:
        response = client.chat.completions.create(
            model="deepseek-v4-flash",
            messages=[{"role": "user", "content": "9.11 和 9.8 哪个更大？"}],
            reasoning_effort="high",
            max_tokens=1000,
        )
        msg = response.choices[0].message
        print(f"✅ 模型: {response.model}")
        print(f"✅ 回答: {msg.content}")
        if hasattr(msg, "reasoning_content") and msg.reasoning_content:
            print(f"💭 推理过程: {msg.reasoning_content[:300]}...")
        print(f"📊 Token: {response.usage.total_tokens}")
        return True
    except Exception as e:
        print(f"❌ 错误: {e}")
        return False


def test_function_calling():
    """测试 4: Function Calling"""
    print("\n" + "=" * 60)
    print("🧪 测试 4: Function Calling")
    print("=" * 60)
    client = init_client()
    tools = [
        {
            "type": "function",
            "function": {
                "name": "get_weather",
                "description": "获取指定城市的当前天气",
                "parameters": {
                    "type": "object",
                    "properties": {"city": {"type": "string"}},
                    "required": ["city"],
                },
            },
        }
    ]
    try:
        response = client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[{"role": "user", "content": "今天上海天气怎么样？"}],
            tools=tools,
            tool_choice="auto",
        )
        msg = response.choices[0].message
        print(f"✅ finish_reason: {response.choices[0].finish_reason}")
        if msg.tool_calls:
            for tc in msg.tool_calls:
                print(f"✅ 调用工具: {tc.function.name}({tc.function.arguments})")
                # 模拟工具执行
                print(f"   → 模拟返回结果: {{'temp': 22, 'desc': '多云'}}")
        else:
            print(f"✅ 直接回复: {msg.content}")
        return True
    except Exception as e:
        print(f"❌ 错误: {e}")
        return False


def test_models_list():
    """测试 5: 获取模型列表"""
    print("\n" + "=" * 60)
    print("🧪 测试 5: GET /v1/models")
    print("=" * 60)
    client = init_client()
    try:
        models = client.models.list()
        print(f"✅ 可用模型: {len(models.data)} 个")
        for m in models.data:
            print(f"  📦 {m.id}")
            if hasattr(m, "context_length"):
                print(f"     上下文: {m.context_length:,} tokens | 输出: {m.max_output_length:,} tokens")
            if hasattr(m, "input_modalities"):
                print(f"     输入: {m.input_modalities} | 输出: {m.output_modalities}")
            if hasattr(m, "supported_features"):
                print(f"     支持特性: {m.supported_features}")
        return True
    except Exception as e:
        print(f"❌ 错误: {e}")
        return False


def test_image_base64(image_path: str = "/www/wwwroot/eclaw/sensenova-test/test_image.jpg"):
    """测试 6: 图像理解 (base64方式，可访问性更高)"""
    print("\n" + "=" * 60)
    print("🧪 测试 6: 图像理解 (Base64)")
    print("=" * 60)
    client = init_client()

    # 生成一张简单的测试图片 (1x1 红色 PNG)
    if not image_path or not os.path.exists(image_path):
        # 创建一个最小的PNG图片
        png_data = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
        )
        img_b64 = base64.b64encode(png_data).decode()
        image_source = f"data:image/png;base64,{img_b64}"
        print(f"📷 使用内置 1x1 测试图片")
    else:
        with open(image_path, "rb") as f:
            img_b64 = base64.b64encode(f.read()).decode()
        image_source = f"data:image/jpeg;base64,{img_b64}"
        print(f"📷 使用本地图片: {image_path}")

    try:
        response = client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "这张图片的主色调是什么？用一句话回答。"},
                        {"type": "image_url", "image_url": {"url": image_source}},
                    ],
                },
            ],
            max_tokens=100,
        )
        msg = response.choices[0].message
        print(f"✅ 描述: {extract_content(msg)}")
        return True
    except Exception as e:
        print(f"❌ 错误: {e}")
        return False


def main():
    print("🦀 SenseNova API 测试套件 v2")
    print(f"📍 Base URL: {BASE_URL}")
    print(f"🤖 模型: {DEFAULT_MODEL}")
    print(f"🔑 API Key: {API_KEY[:10]}...{API_KEY[-6:]}\n")

    results = []
    results.append(("纯文本对话", test_text_chat()))
    results.append(("流式对话", test_stream_chat()))
    results.append(("DeepSeek 思考", test_deepseek()))
    results.append(("Function Calling", test_function_calling()))
    results.append(("模型列表", test_models_list()))
    results.append(("图像理解(Base64)", test_image_base64()))

    print("\n" + "=" * 60)
    print("📋 测试结果汇总")
    print("=" * 60)
    passed = 0
    for name, ok in results:
        print(f"{'✅ PASS' if ok else '❌ FAIL'}  {name}")
        if ok:
            passed += 1
    print(f"\n🎯 通过率: {passed}/{len(results)}")
    return passed == len(results)


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)