import asyncio
import json
import pathlib
import time
import random
import re
from collections import defaultdict
from llm_client import LLMClientFactory

def extract_json_from_response(response: str) -> dict:
    """
    从模型响应中提取JSON，增强鲁棒性
    """
    # 方法1: 尝试提取```json代码块中的内容
    json_pattern1 = r'```json\s*\n?(.*?)\n?\s*```'
    match = re.search(json_pattern1, response, re.DOTALL | re.IGNORECASE)
    if match:
        json_str = match.group(1).strip()
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            pass
    
    # 方法2: 尝试提取```代码块中的内容（没有json标识）
    json_pattern2 = r'```\s*\n?(.*?)\n?\s*```'
    match = re.search(json_pattern2, response, re.DOTALL)
    if match:
        json_str = match.group(1).strip()
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            pass
    
    # 方法3: 查找大括号包围的JSON对象
    json_pattern3 = r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}'
    matches = re.findall(json_pattern3, response, re.DOTALL)
    for match in matches:
        try:
            return json.loads(match.strip())
        except json.JSONDecodeError:
            continue
    
    # 方法4: 尝试直接解析整个响应（去除前后空白）
    try:
        return json.loads(response.strip())
    except json.JSONDecodeError:
        pass
    
    # 如果所有方法都失败，返回None
    return None

async def main():
    """
    评估 LM Studio 提供的 qwen2.5-vl-7b-instruct 模型
    在 co-detector 数据集上的表现。
    """
    # --- 配置 ---
    provider = "lmstudio"
    model_name = "gemma-3-4b-it"
    dataset_path = pathlib.Path("dataset/huggingface/co-detector")
    metadata_file = dataset_path / "metadata.jsonl"

    prompt_template = """
便携式CO检测器外观特征: 
- 矩形/多边形小盒子，大约巴掌大小 
- 正面有一个小显示屏 
- 一般顶部或正面有个较大的按钮 
- 颜色一般为深蓝色/黑色或者橙色 
- 挂在胸前或腰部 

--- 
图中作业人员是否佩戴了便携式CO检测器,并严格按照以下JSON格式输出结果
{
  "has-co-detector": true|false,
  "color": "检测器的颜色（若存在）",
  "position": "佩戴位置（若存在）"
}
"""

    # --- 初始化客户端 ---
    try:
        client = LLMClientFactory.create_client(
            provider=provider, 
            model_name=model_name
        )
    except Exception as e:
        print(f"初始化 LLM 客户端失败: {e}")
        return

    print(f"正在使用模型: {client.model_name}")
    print("-" * 30)

    # --- 加载数据集 ---
    if not metadata_file.exists():
        print(f"错误: 元数据文件未找到 {metadata_file}")
        return

    with open(metadata_file, "r") as f:
        dataset = [json.loads(line) for line in f]
    total_samples = len(dataset)
    correct_predictions = 0
    
    # 时间统计
    total_time = 0
    valid_predictions = 0
    
    # 二分类统计
    class_stats = {
        "true": {"correct": 0, "total": 0, "predicted": 0},   # 佩戴CO检测器
        "false": {"correct": 0, "total": 0, "predicted": 0}  # 未佩戴CO检测器
    }
    
    # 调试信息收集（color和position不参与统计）
    debug_info = []
    
    # 存储所有预测结果用于均衡统计
    all_predictions = []

    # --- 开始评估 ---
    for i, item in enumerate(dataset):
        image_path = item.get("file_name")
        ground_truth = item.get("has-co-detector")

        if image_path is None or ground_truth is None:
            print(f"跳过第 {i+1} 个样本: 数据不完整")
            continue

        # 构建完整图片路径
        full_image_path = dataset_path / image_path

        print(f"正在处理样本 {i+1}/{total_samples}: {full_image_path.name}")

        # 统计真实标签总数
        ground_truth_str = "true" if ground_truth else "false"
        class_stats[ground_truth_str]["total"] += 1

        try:
            # 记录开始时间
            start_time = time.time()
            
            response = await client.async_fast_chat(
                text_input=prompt_template, 
                image_path=str(full_image_path)
            )
            
            # 记录结束时间
            end_time = time.time()
            prediction_time = end_time - start_time
            total_time += prediction_time
            valid_predictions += 1
            
            # 提取 JSON 部分 - 使用增强的鲁棒解析
            response_data = extract_json_from_response(response)
            
            if response_data is None:
                print(f"  - 错误: 无法从响应中提取有效的JSON")
                print(f"  - 原始响应: {response}")
                continue
                
            predicted_has_co_detector = response_data.get("has-co-detector")
            
            # 收集调试信息
            debug_entry = {
                "file_name": image_path,
                "ground_truth": ground_truth,
                "predicted": predicted_has_co_detector,
                "color": response_data.get("color"),
                "position": response_data.get("position"),
                "correct": predicted_has_co_detector == ground_truth
            }
            debug_info.append(debug_entry)

            print(f"  - 真实标签: {ground_truth}")
            print(f"  - 预测标签: {predicted_has_co_detector}")
            print(f"  - 调试信息 - 颜色: {response_data.get('color')}")
            print(f"  - 调试信息 - 位置: {response_data.get('position')}")
            print(f"  - 耗时: {prediction_time:.2f}秒")

            # 统计预测标签数量
            predicted_str = "true" if predicted_has_co_detector else "false"
            class_stats[predicted_str]["predicted"] += 1

            # 判断是否正确并更新统计
            if predicted_has_co_detector == ground_truth:
                correct_predictions += 1
                class_stats[ground_truth_str]["correct"] += 1
                print("  - 结果: 正确")
            else:
                print("  - 结果: 错误")
            
            # 存储预测结果用于均衡统计
            all_predictions.append({
                "ground_truth": ground_truth_str,
                "predicted": predicted_str,
                "is_correct": predicted_has_co_detector == ground_truth
            })

        except Exception as e:
            print(f"  - 发生错误: {e}")
        
        print("-" * 20)

    # --- 输出评估结果 ---
    if total_samples > 0:
        accuracy = (correct_predictions / total_samples) * 100
        avg_time = total_time / valid_predictions if valid_predictions > 0 else 0
        
        print("\n" + "=" * 50)
        print("评估完成 - CO检测器识别统计报告")
        print("=" * 50)
        
        # 总体统计
        print(f"\n【总体统计】")
        print(f"总样本数: {total_samples}")
        print(f"正确预测数: {correct_predictions}")
        print(f"总体准确率: {accuracy:.2f}%")
        print(f"有效预测数: {valid_predictions}")
        print(f"总耗时: {total_time:.2f}秒")
        print(f"平均耗时: {avg_time:.2f}秒/样本")
        
        # 计算均衡统计
        print("\n正在计算均衡统计...")
        
        # 按真实标签分组所有预测
        predictions_by_label = defaultdict(list)
        for pred in all_predictions:
            predictions_by_label[pred["ground_truth"]].append(pred)
        
        # 找到样本最少的类别数量
        min_samples = min(len(predictions) for predictions in predictions_by_label.values())
        print(f"最少样本类别数量: {min_samples}")
        
        # 从每个类别随机抽取min_samples个样本
        balanced_predictions = []
        for label in ["true", "false"]:
            if label in predictions_by_label:
                label_predictions = predictions_by_label[label]
                if len(label_predictions) > min_samples:
                    # 随机抽取min_samples个样本
                    sampled_predictions = random.sample(label_predictions, min_samples)
                else:
                    # 如果样本数量不足min_samples，使用全部样本
                    sampled_predictions = label_predictions
                balanced_predictions.extend(sampled_predictions)
        
        # 计算均衡统计
        balanced_correct = sum(1 for pred in balanced_predictions if pred["is_correct"])
        balanced_total = len(balanced_predictions)
        balanced_accuracy = (balanced_correct / balanced_total * 100) if balanced_total > 0 else 0
        
        # 均衡总体统计
        print(f"\n【均衡总体统计】")
        print(f"均衡样本数: {balanced_total}")
        print(f"均衡正确预测数: {balanced_correct}")
        print(f"均衡总体准确率: {balanced_accuracy:.2f}%")
        print(f"各类别样本数: {min_samples}")
        
        # 显示均衡统计中各类别的分布
        print(f"\n均衡统计中各类别分布:")
        for label in ["true", "false"]:
            count = sum(1 for pred in balanced_predictions if pred["ground_truth"] == label)
            class_label = "佩戴CO检测器" if label == "true" else "未佩戴CO检测器"
            print(f"  {class_label} ({label}): {count}个样本")
        
        # 二分类详细统计
        print(f"\n【二分类详细统计】")
        print("-" * 30)
        
        for label in ["true", "false"]:
            stats = class_stats[label]
            total = stats["total"]
            correct = stats["correct"]
            predicted = stats["predicted"]
            
            # 计算精确率、召回率、F1分数
            precision = (correct / predicted * 100) if predicted > 0 else 0
            recall = (correct / total * 100) if total > 0 else 0
            f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0
            
            class_label = "佩戴CO检测器" if label == "true" else "未佩戴CO检测器"
            print(f"\n类别: {class_label} ({label})")
            print(f"  实际样本数: {total}")
            print(f"  预测样本数: {predicted}")
            print(f"  正确预测数: {correct}")
            print(f"  召回率 (Recall): {recall:.2f}%")
            print(f"  精确率 (Precision): {precision:.2f}%")
            print(f"  F1分数: {f1:.2f}")
        
        # 混淆矩阵
        print(f"\n【混淆矩阵】")
        print("-" * 30)
        tp = class_stats["true"]["correct"]  # 真正例：实际佩戴，预测佩戴
        fn = class_stats["true"]["total"] - class_stats["true"]["correct"]  # 假负例：实际佩戴，预测未佩戴
        fp = class_stats["true"]["predicted"] - class_stats["true"]["correct"]  # 假正例：实际未佩戴，预测佩戴
        tn = class_stats["false"]["correct"]  # 真负例：实际未佩戴，预测未佩戴
        
        print(f"真正例 (TP): {tp} - 实际佩戴，预测佩戴")
        print(f"假负例 (FN): {fn} - 实际佩戴，预测未佩戴")
        print(f"假正例 (FP): {fp} - 实际未佩戴，预测佩戴")
        print(f"真负例 (TN): {tn} - 实际未佩戴，预测未佩戴")
        
        # 敏感性和特异性
        sensitivity = (tp / (tp + fn) * 100) if (tp + fn) > 0 else 0  # 召回率
        specificity = (tn / (tn + fp) * 100) if (tn + fp) > 0 else 0
        
        print(f"\n敏感性 (Sensitivity/Recall): {sensitivity:.2f}%")
        print(f"特异性 (Specificity): {specificity:.2f}%")
        
        # 保存调试信息到文件
        debug_file = f"debug_co_detector_{int(time.time())}.json"
        with open(debug_file, "w", encoding="utf-8") as f:
            json.dump(debug_info, f, ensure_ascii=False, indent=2)
        
        print(f"\n调试信息已保存到: {debug_file}")
        
    else:
        print("没有可评估的样本。")

if __name__ == "__main__":
    asyncio.run(main())
