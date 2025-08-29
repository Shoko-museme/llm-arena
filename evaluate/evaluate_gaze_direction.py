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
    在 gaze-direction 数据集上的表现。
    """
    # --- 配置 ---
    provider = "aihubmix" # 'aihubmix' or 'bigmodel' or 'lmstudio' or 'aliyun'
    model_name = "Qwen/Qwen2.5-VL-32B-Instruct"
    dataset_path = pathlib.Path("dataset/huggingface/gaze-direction")
    metadata_file = dataset_path / "metadata.jsonl"

    prompt_template = """
**Image Description:** A surveillance camera view from a steel mill. The upper part of the image shows a section of a steel rolling line, consisting of a conveyor track that runs from left to right and multiple rolling mills. Steel billets from upstream (outside the left of the frame) are conveyed through the mills and rolled into bars.
**Task:** Determine the gaze direction of the person marked with a red box in the surveillance image (looking towards the upstream direction of the rolling line | looking towards the downstream direction of the rolling line | gaze clearly diverted from the rolling line) and strictly output in JSON.
**Output Requirements:**
* The JSON must include:
    * "gaze_direction": "upstream" | "downstream" | "clearly_diverted"
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
    
    # 分类统计 - 使用混淆矩阵的思路
    class_stats = defaultdict(lambda: {"correct": 0, "total": 0, "predicted": 0})
    all_labels = ["upstream", "downstream", "clearly_diverted"]
    
    # 初始化统计字典（包括not-upstream类别）
    for label in all_labels:
        class_stats[label] = {"correct": 0, "total": 0, "predicted": 0}
    
    # 添加not-upstream类别统计
    class_stats["not-upstream"] = {"correct": 0, "total": 0, "predicted": 0}
    
    # 存储所有预测结果用于均衡统计
    all_predictions = []

    # --- 开始评估 ---
    for i, item in enumerate(dataset):
        image_path = item.get("file_name")
        ground_truth_label = item.get("gaze_direction")

        if not image_path or not ground_truth_label:
            print(f"跳过第 {i+1} 个样本: 数据不完整")
            continue

        # The path in metadata.jsonl is like "images/frame_0012_box-1756378134881.jpg".
        # Let's adjust based on the dataset structure. The metadata.jsonl is in dataset/huggingface/gaze-direction.
        # So the image path should be relative to that.
        full_image_path = dataset_path / image_path

        print(f"正在处理样本 {i+1}/{total_samples}: {full_image_path.name}")

        # 统计真实标签总数
        if ground_truth_label in class_stats:
            class_stats[ground_truth_label]["total"] += 1
        
        # 统计not-upstream类别（downstream或clearly_diverted）
        if ground_truth_label in ["downstream", "clearly_diverted"]:
            class_stats["not-upstream"]["total"] += 1

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
            
            # 提取 JSON 部分
            response_data = extract_json_from_response(response)

            if response_data is None:
                print(f"  - 错误: 无法从响应中提取有效的JSON")
                print(f"  - 原始响应: {response}")
                continue
            
            predicted_label = response_data.get("gaze_direction")

            print(f"  - 真实标签: {ground_truth_label}")
            print(f"  - 预测标签: {predicted_label}")
            print(f"  - 耗时: {prediction_time:.2f}秒")

            # 统计预测标签数量
            if predicted_label in class_stats:
                class_stats[predicted_label]["predicted"] += 1
            
            # 统计not-upstream预测数量
            if predicted_label in ["downstream", "clearly_diverted"]:
                class_stats["not-upstream"]["predicted"] += 1

            # 判断是否正确并更新统计
            if predicted_label == ground_truth_label:
                correct_predictions += 1
                if ground_truth_label in class_stats:
                    class_stats[ground_truth_label]["correct"] += 1
                print("  - 结果: 正确")
            else:
                print("  - 结果: 错误")
            
            # 判断not-upstream类别的正确性
            ground_is_not_upstream = ground_truth_label in ["downstream", "clearly_diverted"]
            predicted_is_not_upstream = predicted_label in ["downstream", "clearly_diverted"]
            
            if ground_is_not_upstream and predicted_is_not_upstream:
                class_stats["not-upstream"]["correct"] += 1
            
            # 存储预测结果用于均衡统计
            all_predictions.append({
                "ground_truth": ground_truth_label,
                "predicted": predicted_label,
                "is_correct": predicted_label == ground_truth_label
            })

        except json.JSONDecodeError:
            print(f"  - 错误: 无法解析模型的 JSON 输出: {response}")
            print(f"  - 原始响应: {response}")
        except Exception as e:
            print(f"  - 发生错误: {e}")
        
        print("-" * 20)

    # --- 输出评估结果 ---
    if total_samples > 0:
        accuracy = (correct_predictions / total_samples) * 100
        avg_time = total_time / valid_predictions if valid_predictions > 0 else 0
        
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
        for label in all_labels:
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
        
        print("\n" + "=" * 50)
        print("评估完成 - 详细统计报告")
        print("=" * 50)
        
        # 总体统计
        print(f"\n【总体统计】")
        print(f"总样本数: {total_samples}")
        print(f"正确预测数: {correct_predictions}")
        print(f"总体准确率: {accuracy:.2f}%")
        print(f"有效预测数: {valid_predictions}")
        print(f"总耗时: {total_time:.2f}秒")
        print(f"平均耗时: {avg_time:.2f}秒/样本")
        
        # 均衡总体统计
        print(f"\n【均衡总体统计】")
        print(f"均衡样本数: {balanced_total}")
        print(f"均衡正确预测数: {balanced_correct}")
        print(f"均衡总体准确率: {balanced_accuracy:.2f}%")
        print(f"各类别样本数: {min_samples}")
        
        # 显示均衡统计中各类别的分布
        print(f"\n均衡统计中各类别分布:")
        for label in all_labels:
            count = sum(1 for pred in balanced_predictions if pred["ground_truth"] == label)
            print(f"  {label}: {count}个样本")
        
        # 各类别详细统计
        print(f"\n【各类别统计】")
        print("-" * 30)
        
        # 显示原始三类别统计
        for label in all_labels:
            stats = class_stats[label]
            total = stats["total"]
            correct = stats["correct"]
            predicted = stats["predicted"]
            
            # 计算精确率、召回率
            precision = (correct / predicted * 100) if predicted > 0 else 0
            recall = (correct / total * 100) if total > 0 else 0
            f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0
            
            print(f"\n类别: {label}")
            print(f"  实际样本数: {total}")
            print(f"  预测样本数: {predicted}")
            print(f"  正确预测数: {correct}")
            print(f"  召回率 (Recall): {recall:.2f}%")
            print(f"  精确率 (Precision): {precision:.2f}%")
            print(f"  F1分数: {f1:.2f}")
        
        # 显示not-upstream二分类统计
        print(f"\n【二分类统计 (upstream vs not-upstream)】")
        print("-" * 40)
        
        # upstream统计
        upstream_stats = class_stats["upstream"]
        upstream_total = upstream_stats["total"]
        upstream_correct = upstream_stats["correct"]
        upstream_predicted = upstream_stats["predicted"]
        upstream_precision = (upstream_correct / upstream_predicted * 100) if upstream_predicted > 0 else 0
        upstream_recall = (upstream_correct / upstream_total * 100) if upstream_total > 0 else 0
        upstream_f1 = (2 * upstream_precision * upstream_recall / (upstream_precision + upstream_recall)) if (upstream_precision + upstream_recall) > 0 else 0
        
        print(f"\n类别: upstream")
        print(f"  实际样本数: {upstream_total}")
        print(f"  预测样本数: {upstream_predicted}")
        print(f"  正确预测数: {upstream_correct}")
        print(f"  召回率 (Recall): {upstream_recall:.2f}%")
        print(f"  精确率 (Precision): {upstream_precision:.2f}%")
        print(f"  F1分数: {upstream_f1:.2f}")
        
        # not-upstream统计
        not_upstream_stats = class_stats["not-upstream"]
        not_upstream_total = not_upstream_stats["total"]
        not_upstream_correct = not_upstream_stats["correct"]
        not_upstream_predicted = not_upstream_stats["predicted"]
        not_upstream_precision = (not_upstream_correct / not_upstream_predicted * 100) if not_upstream_predicted > 0 else 0
        not_upstream_recall = (not_upstream_correct / not_upstream_total * 100) if not_upstream_total > 0 else 0
        not_upstream_f1 = (2 * not_upstream_precision * not_upstream_recall / (not_upstream_precision + not_upstream_recall)) if (not_upstream_precision + not_upstream_recall) > 0 else 0
        
        print(f"\n类别: not-upstream (downstream + clearly_diverted)")
        print(f"  实际样本数: {not_upstream_total}")
        print(f"  预测样本数: {not_upstream_predicted}")
        print(f"  正确预测数: {not_upstream_correct}")
        print(f"  召回率 (Recall): {not_upstream_recall:.2f}%")
        print(f"  精确率 (Precision): {not_upstream_precision:.2f}%")
        print(f"  F1分数: {not_upstream_f1:.2f}")
        
        # 二分类总体准确率
        binary_correct = upstream_correct + not_upstream_correct
        binary_accuracy = (binary_correct / total_samples * 100) if total_samples > 0 else 0
        print(f"\n二分类总体准确率: {binary_accuracy:.2f}%")
        
        # 混淆矩阵信息
        print(f"\n【混淆矩阵摘要】")
        print("-" * 30)
        print("格式: 真实标签 -> 预测标签数量")
        for true_label in all_labels:
            true_count = class_stats[true_label]["total"]
            if true_count > 0:
                print(f"{true_label} ({true_count}个样本):")
                # 这里可以进一步细化显示每个真实标签被预测为哪些类别
                # 但目前的统计结构需要调整才能实现，暂时显示基本信息
                correct_count = class_stats[true_label]["correct"]
                print(f"  正确预测: {correct_count}")
                print(f"  错误预测: {true_count - correct_count}")
        
    else:
        print("没有可评估的样本。")

if __name__ == "__main__":
    asyncio.run(main())
