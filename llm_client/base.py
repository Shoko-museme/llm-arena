from abc import ABC, abstractmethod
from typing import Optional, Union
from pathlib import Path


class LLMClient(ABC):
    """LLM客户端抽象基类"""
    
    @abstractmethod
    def fast_chat(self, text_input: str, image_path: Optional[Union[str, Path]] = None) -> str:
        """
        快速聊天功能，支持文本和图片输入
        
        Args:
            text_input: 文本输入
            image_path: 图片文件路径（可选）
            
        Returns:
            LLM的回应文本
        """
        pass


class LLMClientFactory:
    """LLM客户端工厂类"""
    
    _clients = {}
    
    @classmethod
    def register_client(cls, provider: str, client_class):
        """注册LLM客户端"""
        cls._clients[provider] = client_class
    
    @classmethod
    def create_client(cls, provider: str, model_name: str, **kwargs) -> LLMClient:
        """
        创建LLM客户端实例
        
        Args:
            provider: 供应商名称
            model_name: 模型名称
            **kwargs: 其他配置参数
            
        Returns:
            LLM客户端实例
        """
        if provider not in cls._clients:
            raise ValueError(f"Unsupported provider: {provider}")
        
        return cls._clients[provider](model_name, **kwargs)
    
    @classmethod
    def get_supported_providers(cls) -> list:
        """获取支持的供应商列表"""
        return list(cls._clients.keys())