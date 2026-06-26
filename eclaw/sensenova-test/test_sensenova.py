"""
SenseNova API 测试脚本
使用 OpenAI SDK 调用 SenseNova 接口
"""
import os
import sys
from openai import OpenAI

# ==================== 配置 ====================
API_KEY = os.getenv("SENSENOVA_API_KEY", "sk-J3aaNZBvFSvpHJhmiASXCrkx1abynDhA")
BASE_URL = "https://token.sensenova.cn/v1"
DEFAULT_MODEL = "sensenova-6.7-flash-lite"


def init_client() -> OpenAI:
    """初始化 OpenAI 兼容客户端"""
    return OpenAI(api_key=API_KEY, base_url=BASE_URL)


def test_text_chat():
    """测试 1: 纯文本对话"""
    print("=" * 60)
    print("🧪 测试 1: 纯文本对话 (sensenova-6.7-flash-lite)")
    print("=" * 60)
    client = init_client()
    try:
        response = client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[
                {"role": "system", "content": "你是一个有用的助手。"},
                {"role": "user", "content": "请用一句话介绍一下商汤科技。"},
            ],
            stream=False,
            temperature=0.6,
            max_tokens=500,
        )
        print(f"✅ 模型: {response.model}")
        print(f"✅ 响应: {response.choices[0].message.content}")
        print(f"📊 Token 使用: {response.usage.total_tokens} (输入 {response.usage.prompt_tokens} / 输出 {response.usage.completion_tokens})")
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
                {"role": "user", "content": "用三句话介绍一下人工智能的发展历史。"},
            ],
            stream=True,
            temperature=0.6,
            max_tokens=300,
        )
        print("✅ 流式响应（逐字输出）:")
        full_content = ""
        for chunk in stream:
            if chunk.choices[0].delta.content:
                content = chunk.choices[0].delta.content
                full_content += content
                print(content, end="", flush=True)
        print("\n")
        print(f"📝 完整内容长度: {len(full_content)} 字符")
        return True
    except Exception as e:
        print(f"\n❌ 错误: {e}")
        return False


def test_image_understanding():
    """测试 3: 图像输入（多模态理解）"""
    print("\n" + "=" * 60)
    print("🧪 测试 3: 图像理解 (image_url)")
    print("=" * 60)
    client = init_client()
    # 使用一张公开图片
    test_image_url = "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/GoldenGateBridge-001.jpg/1200px-GoldenGateBridge-001.jpg"
    try:
        response = client.chat.completions.create(
            model=DEFAULT_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "请用中文描述这张图片（20字以内）。"},
                        {"type": "image_url", "image_url": {"url": test_image_url}},
                    ],
                },
            ],
            max_tokens=200,
        )
        print(f"✅ 图片: {test_image_url}")
        print(f"✅ 模型描述: {response.choices[0].message.content}")
        return True
    except Exception as e:
        print(f"❌ 错误: {e}")
        return False


def test_function_calling():
    """测试 4: Function Calling 工具调用"""
    print("\n" + "=" * 60)
    print("🧪 测试 4: Function Calling")
    print("=" * 60)
    client = init_client()

    def get_weather(city: str) -> str:
        """模拟天气查询函数"""
        return f"{city} 今天天气晴，气温 22°C，微风。"

    tools = [
        {
            "type": "function",
            "function": {
                "name": "get_weather",
                "description": "获取指定城市的当前天气",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "city": {"type": "string", "description": "城市名称"}
                    },
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
        print(f"✅ 模型返回 finish_reason: {response.choices[0].finish_reason}")
        if msg.tool_calls:
            print(f"✅ 模型请求调用工具: {msg.tool_calls[0].function.name}")
            print(f"   参数: {msg.tool_calls[0].function.arguments}")
        else:
            print(f"✅ 模型直接回复: {msg.content}")
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
        print(f"✅ 可用模型数量: {len(models.data)}")
        for m in models.data:
            print(f"  - {m.id}")
            if hasattr(m, "context_length"):
                print(f"    上下文: {m.context_length}, 输出: {m.max_output_length}")
        return True
    except Exception as e:
        print(f"❌ 错误: {e}")
        return False


def main():
    print("🦀 SenseNova API 测试套件")
    print(f"📍 Base URL: {BASE_URL}")
    print(f"🤖 默认模型: {DEFAULT_MODEL}")
    print(f"🔑 API Key: {API_KEY[:10]}...{API_KEY[-6:]}\n")

    results = []
    results.append(("纯文本对话", test_text_chat()))
    results.append(("流式对话", test_stream_chat()))
    results.append(("图像理解", test_image_understanding()))
    results.append(("Function Calling", test_function_calling()))
    results.append(("模型列表", test_models_list()))

    print("\n" + "=" * 60)
    print("📋 测试结果汇总")
    print("=" * 60)
    passed = 0
    for name, ok in results:
        status = "✅ PASS" if ok else "❌ FAIL"
        print(f"{status}  {name}")
        if ok:
            passed += 1
    print(f"\n🎯 通过率: {passed}/{len(results)}")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()