from openai import OpenAI, AsyncOpenAI
from typing import Optional, Union
from pathlib import Path
import base64
import os
import asyncio
from .base import LLMClient, LLMClientFactory

class LMStudioClient(LLMClient):
    """LMStudio LLM客户端实现"""
    
    def __init__(self, model_name: str = "local-model", **kwargs):
        """
        初始化LMStudio客户端
        
        Args:
            model_name: 模型名称 (在LM Studio中通常不是必需的，但保留以兼容)
        """
        # LM Studio本地服务器不需要API密钥
        self.client = OpenAI(base_url="http://192.168.1.2:1234/v1", api_key="not-needed")
        self.async_client = AsyncOpenAI(base_url="http://192.168.1.2:1234/v1", api_key="not-needed")
        self.model_name = model_name

    def _encode_image(self, image_path: Union[str, Path]) -> str:
        """
        将图片文件编码为base64格式
        """
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')

    def _get_image_mime_type(self, image_path: Union[str, Path]) -> str:
        """
        获取图片文件的MIME类型
        """
        image_path = Path(image_path)
        suffix = image_path.suffix.lower()
        
        mime_types = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.bmp': 'image/bmp',
            '.webp': 'image/webp'
        }
        
        return mime_types.get(suffix, 'image/jpeg')

    def fast_chat(self, text_input: str, image_path: Optional[Union[str, Path]] = None) -> str:
        """
        快速聊天功能，支持文本和图片输入
        """
        content = []
        if image_path:
            image_base64 = self._encode_image(image_path)
            mime_type = self._get_image_mime_type(image_path)
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:{mime_type};base64,{image_base64}"
                }
            })
        
        content.append({
            "type": "text",
            "text": text_input
        })

        messages = [
            {
                "role": "user",
                "content": content
            }
        ]
        
        try:
            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                max_tokens=8192, # 可根据需要调整
                temperature=0.1,
            )
            return response.choices[0].message.content
        except Exception as e:
            raise Exception(f"LM Studio API调用失败: {str(e)}")

    async def async_fast_chat(self, text_input: str, image_path: Optional[Union[str, Path]] = None) -> str:
        """
        异步快速聊天功能，支持文本和图片输入
        """
        content = []
        if image_path:
            image_base64 = self._encode_image(image_path)
            mime_type = self._get_image_mime_type(image_path)
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:{mime_type};base64,{image_base64}"
                }
            })
        
        content.append({
            "type": "text",
            "text": text_input
        })

        messages = [
            {
                "role": "user",
                "content": content
            }
        ]
        
        try:
            response = await self.async_client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                max_tokens=8192, # 可根据需要调整
                temperature=0.1,
            )
            return response.choices[0].message.content
        except Exception as e:
            raise Exception(f"LM Studio API异步调用失败: {str(e)}")

# 注册LMStudio客户端到工厂
LLMClientFactory.register_client("lmstudio", LMStudioClient)
