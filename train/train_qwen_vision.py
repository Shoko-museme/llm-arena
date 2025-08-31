
import re
import torch
from unsloth import FastVisionModel
from datasets import load_dataset
from trl import SFTTrainer, SFTConfig
from unsloth.trainer import UnslothVisionDataCollator


def evaluate_accuracy(model, tokenizer, eval_dataset, instruction, save_path:str|None=None) -> float:
    FastVisionModel.for_inference(model)
    allowed_labels = {"upstream", "downstream", "clearly_diverted"}

    def extract_label(text: str) -> str | None:
        """Extract the last occurrence of any allowed label from text, ignoring quotes/prefix."""
        if not text:
            return None
        text = text.lower()
        # direct equality after stripping punctuation / quotes
        simple = re.sub(r'["\'`\s]', '', text)
        if simple in allowed_labels:
            return simple
        # find all occurrences, pick the last (often the real answer at end)
        matches = re.findall(r"(upstream|downstream|clearly_diverted)", text)
        return matches[-1] if matches else None

    correct = 0
    total = len(eval_dataset)
    detailed_results = []

    for idx, sample in enumerate(eval_dataset):
        image = sample["image"]
        gold = str(sample["gaze_direction"]).strip().lower()
        messages = [
            {"role": "user", "content": [
                {"type": "image"},
                {"type": "text", "text": instruction},
            ]}
        ]
        input_text = tokenizer.apply_chat_template(messages, add_generation_prompt=True)
        inputs = tokenizer(
            image,
            input_text,
            add_special_tokens=False,
            return_tensors="pt",
        ).to("cuda")
        with torch.no_grad():
            generated_ids = model.generate(
                **inputs,
                max_new_tokens=32,
                use_cache=True,
                temperature=0.0,
                top_p=1.0,
                do_sample=False,
            )
        prompt_len = inputs["input_ids"].shape[1]
        gen_only = generated_ids[:, prompt_len:]
        text = tokenizer.batch_decode(gen_only, skip_special_tokens=True)[0]
        pred = extract_label(text)
        is_correct = pred is not None and pred == gold
        if is_correct:
            correct += 1
        detailed_results.append({
            "index": idx,
            "gold": gold,
            "prediction": pred,
            "raw_text": text,
            "correct": is_correct,
        })

    # save detailed results
    import json, os
    if save_path is not None:
        os.makedirs(os.path.dirname(save_path) or ".", exist_ok=True)
        with open(save_path, "w", encoding="utf-8") as f:
            for item in detailed_results:
                f.write(json.dumps(item, ensure_ascii=False) + "\n")

    return (correct / total) if total > 0 else 0.0


def main():
    # Model and Tokenizer Loading (base model for pre-eval)
    model, tokenizer = FastVisionModel.from_pretrained(
        "unsloth/Qwen2.5-VL-7B-Instruct-bnb-4bit",
        load_in_4bit=True,
        use_gradient_checkpointing="unsloth",
    )

    # Data Preparation (done later) stays same

    # === Prepare dataset split first ===
    dataset = load_dataset('dataset/huggingface/gaze-direction', split="train")
    split_dataset = dataset.train_test_split(test_size=15, seed=42)
    train_dataset = split_dataset['train']
    eval_dataset = split_dataset['test']

    instruction = """**Image Description:** A surveillance camera view from a steel mill. The upper part of the image shows a section of a steel rolling line, consisting of a conveyor track that runs from left to right and multiple rolling mills. Steel billets from upstream (outside the left of the frame) are conveyed through the mills and rolled into bars.
**Task:** Determine the gaze direction of the person marked with a red box in the surveillance image (looking towards the upstream direction of the rolling line | looking towards the downstream direction of the rolling line | gaze clearly diverted from the rolling line) and output one of the following labels: "upstream", "downstream", or "clearly_diverted".
"""

    # ---------- Pre-training evaluation ----------
    pre_acc = evaluate_accuracy(model, tokenizer, eval_dataset, instruction, save_path="outputs/pre_eval_results.jsonl")
    print(f"Pre-train eval accuracy over {len(eval_dataset)} samples: {pre_acc:.4f}")

    # --------- Continue to set up LoRA model ---------
    # PEFT/LoRA Configuration
    model = FastVisionModel.get_peft_model(
        model,
        finetune_vision_layers=True,
        finetune_language_layers=True,
        finetune_attention_modules=True,
        finetune_mlp_modules=True,
        r=16,
        lora_alpha=16,
        lora_dropout=0,
        bias="none",
        random_state=3407,
        use_rslora=False,
        loftq_config=None,
    )

    def convert_to_conversation(sample):
        conversation = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": instruction},
                    {"type": "image", "image": sample["image"]}
                ]
            },
            {
                "role": "assistant",
                "content": [
                    {"type": "text", "text": sample["gaze_direction"]}
                ]
            },
        ]
        return {"messages": conversation}

    converted_train_dataset = [convert_to_conversation(sample) for sample in train_dataset]
    converted_eval_dataset = [convert_to_conversation(sample) for sample in eval_dataset]

    # Training
    FastVisionModel.for_training(model)

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        data_collator=UnslothVisionDataCollator(model, tokenizer),
        train_dataset=converted_train_dataset,
        eval_dataset=converted_eval_dataset,
        args=SFTConfig(
            per_device_train_batch_size=2,
            gradient_accumulation_steps=8,
            warmup_steps=5,
            max_steps=30,
            learning_rate=2e-4,
            logging_steps=1,
            optim="adamw_8bit",
            weight_decay=0.01,
            lr_scheduler_type="linear",
            seed=3407,
            output_dir="outputs",
            report_to="none",
            eval_strategy="steps",
            eval_steps=5,
            remove_unused_columns=False,
            dataset_text_field="",
            dataset_kwargs={"skip_prepare_dataset": True},
            max_length=4096,
        ),
    )

    trainer.train()

    # Post-training evaluation
    post_acc = evaluate_accuracy(model, tokenizer, eval_dataset, instruction, save_path="outputs/post_eval_results.jsonl")
    print(f"Post-train eval accuracy over {len(eval_dataset)} samples: {post_acc:.4f}")

    # Saving the model
    model.save_pretrained("lora_model")
    tokenizer.save_pretrained("lora_model")

if __name__ == "__main__":
    main()
