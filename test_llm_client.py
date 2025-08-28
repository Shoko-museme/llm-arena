#!/usr/bin/env python3
"""
LLM客户端测试脚本
测试aihubmix供应商的fast_chat功能
"""

import sys
from pathlib import Path

# 添加项目根目录到Python路径
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from llm_client import LLMClientFactory


def test_text_only():
    """测试纯文本输入"""
    print("=== 测试纯文本输入 ===")
    
    try:
        # 创建aihubmix客户端
        client = LLMClientFactory.create_client(
            provider="aihubmix",
            model_name="gpt-4o-mini"
        )
        
        # 测试文本输入
        response = client.fast_chat("你好，请简单介绍一下你自己")
        print(f"LLM回复: {response}")
        
    except Exception as e:
        print(f"测试失败: {e}")


def test_text_with_image():
    """测试文本+图片输入"""
    print("\n=== 测试文本+图片输入 ===")
    
    try:
        # 创建aihubmix客户端
        client = LLMClientFactory.create_client(
            provider="aihubmix",
            model_name="gpt-4o-mini"
        )
        
        # 图片路径
        image_path = Path(__file__).parent / "llm_client" / "test-image.jpeg"
        
        # 测试文本+图片输入
        response = client.fast_chat(
            text_input="请描述这张图片中的内容",
            image_path=image_path
        )
        print(f"LLM回复: {response}")
        
    except Exception as e:
        print(f"测试失败: {e}")


def test_supported_providers():
    """测试支持的供应商"""
    print("\n=== 测试支持的供应商 ===")
    
    try:
        providers = LLMClientFactory.get_supported_providers()
        print(f"支持的供应商: {providers}")
        
    except Exception as e:
        print(f"测试失败: {e}")


def test_invalid_provider():
    """测试无效供应商"""
    print("\n=== 测试无效供应商 ===")
    
    try:
        client = LLMClientFactory.create_client(
            provider="invalid_provider",
            model_name="gpt-4o-mini"
        )
        
    except ValueError as e:
        print(f"预期的错误: {e}")
    except Exception as e:
        print(f"意外错误: {e}")


if __name__ == "__main__":
    print("开始LLM客户端测试...")
    
    # 测试支持的供应商
    test_supported_providers()
    
    # 测试无效供应商
    test_invalid_provider()
    
    # 测试纯文本输入
    test_text_only()
    
    # 测试文本+图片输入
    test_text_with_image()
    
    print("\n测试完成！")