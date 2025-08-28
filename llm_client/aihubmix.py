from openai import OpenAI
from typing import Optional, Union, List
from pathlib import Path
import base64
from .base import LLMClient, LLMClientFactory


class AiHubMixClient(LLMClient):
    """AiHubMix LLM客户端实现"""
    
    def __init__(self, model_name: str, api_key: str = "sk-ZLHGZGgJ77oDtOAMB0Ac03B1276843DaAaB2E68aE3D095F6"):
        """
        初始化AiHubMix客户端
        
        Args:
            model_name: 模型名称
            api_key: API密钥
        """
        self.model_name = model_name
        self.client = OpenAI(
            api_key=api_key,
            base_url="https://aihubmix.com/v1"
        )
    
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
    
    def _get_image_mime_type(self, image_path: Union[str, Path]) -> str:
        """
        获取图片文件的MIME类型
        
        Args:
            image_path: 图片文件路径
            
        Returns:
            MIME类型字符串
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
        
        Args:
            text_input: 文本输入
            image_path: 图片文件路径（可选）
            
        Returns:
            LLM的回应文本
        """
        # 构建消息内容
        if image_path:
            # 有图片输入，构建多模态消息
            image_base64 = self._encode_image(image_path)
            mime_type = self._get_image_mime_type(image_path)
            
            content = [
                {
                    "type": "text",
                    "text": text_input
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime_type};base64,{image_base64}"
                    }
                }
            ]
        else:
            # 纯文本输入
            content = text_input
        
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
                messages=messages,
                model=self.model_name
            )
            
            # 返回回复内容
            return response.choices[0].message.content
            
        except Exception as e:
            raise Exception(f"AiHubMix API调用失败: {str(e)}")


# 注册AiHubMix客户端到工厂
LLMClientFactory.register_client("aihubmix", AiHubMixClient)