from zai import ZhipuAiClient
from typing import Optional, Union, List
from pathlib import Path
import base64
import os
import asyncio
from dotenv import load_dotenv
from .base import LLMClient, LLMClientFactory

load_dotenv()


class BigModelClient(LLMClient):
    """BigModel (智谱AI) LLM客户端实现"""
    
    def __init__(self, model_name: str = None, api_key: str = None):
        """
        初始化BigModel客户端
        
        Args:
            model_name: 模型名称
            api_key: API密钥
        """
        self.model_name = model_name or os.getenv("BIGMODEL_MODEL_NAME", "glm-4.5v")
        api_key = api_key or os.getenv("BIGMODEL_API_KEY")
        
        if not api_key:
            raise ValueError("BigModel API密钥未提供，请设置环境变量BIGMODEL_API_KEY")
        
        self.client = ZhipuAiClient(api_key=api_key)
    
    def _encode_image(self, image_path: Union[str, Path]) -> str:
        """
        将图片文件编码为base64格式
        
        Args:
            image_path: 图片文件路径
            
        Returns:
            base64编码的图片数据
        """
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')

    def fast_chat(self, text_input: str, image_path: Optional[Union[str, Path]] = None) -> str:
        """
        快速聊天功能，支持文本和图片输入
        
        Args:
            text_input: 文本输入
            image_path: 图片文件路径（可选）
            
        Returns:
            LLM的回应文本
        """
        # 构建消息内容
        content = [
            {
                "type": "text",
                "text": text_input
            }
        ]
        
        if image_path:
            # 有图片输入，添加图片内容
            image_base64 = self._encode_image(image_path)
            
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": image_base64
                }
            })
        
        # 构建消息列表
        messages = [
            {
                "role": "user",
                "content": content
            }
        ]
        
        try:
            # 调用API
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                thinking={
                    "type": "enabled"
                }
            )
            
            # 返回回复内容
            return response.choices[0].message.content
            
        except Exception as e:
            raise Exception(f"BigModel API调用失败: {str(e)}")

    async def async_fast_chat(self, text_input: str, image_path: Optional[Union[str, Path]] = None) -> str:
        """
        异步快速聊天功能，支持文本和图片输入
        
        Args:
            text_input: 文本输入
            image_path: 图片文件路径（可选）
            
        Returns:
            LLM的回应文本
        """
        # BigModel SDK 可能不支持异步，这里使用同步方法的异步包装
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.fast_chat, text_input, image_path)


# 注册BigModel客户端到工厂
LLMClientFactory.register_client("bigmodel", BigModelClient)