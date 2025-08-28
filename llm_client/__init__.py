"""
LLM客户端模块
提供基于工厂模式的LLM客户端实现，支持多个供应商
"""

from .base import LLMClient, LLMClientFactory
from .aihubmix import AiHubMixClient

__all__ = ["LLMClient", "LLMClientFactory", "AiHubMixClient"]